<?php
require __DIR__ . '/config.php';
require __DIR__ . '/helpers.php';

$method = $_SERVER['REQUEST_METHOD'];
$path = parse_url($_SERVER['REQUEST_URI'], PHP_URL_PATH);
$path = '/' . trim(substr($path, strlen('/api')), '/');

class ApiError extends Exception {}

function row_exists($pdo, $table, $id) {
    $allowed = ['menu_items', 'time_slots'];
    if (!in_array($table, $allowed, true)) return false;
    $q = $pdo->prepare("SELECT id FROM $table WHERE id = ?");
    $q->execute([$id]);
    return (bool)$q->fetch();
}

function to_min($t) {
    [$h, $m] = array_map('intval', explode(':', $t));
    return $h * 60 + $m;
}

function to_time($min) {
    return sprintf('%02d:%02d:00', intdiv($min, 60), $min % 60);
}

function make_token($pdo) {
    $letters = 'ABCDEFGHJKLMNPQRSTUVWXYZ';
    $check = $pdo->prepare('SELECT id FROM orders WHERE token = ?');
    for ($i = 0; $i < 20; $i++) {
        $t = $letters[random_int(0, strlen($letters) - 1)] . random_int(100, 999);
        $check->execute([$t]);
        if (!$check->fetch()) return $t;
    }
    throw new ApiError('Could not generate a pickup token, please try again', 500);
}

function place_order($pdo, $userId, $body) {
    $slotId = (int)($body['slot_id'] ?? 0);
    $raw = $body['items'] ?? [];
    if (!$slotId || !is_array($raw) || count($raw) === 0) {
        throw new ApiError('Choose a pickup slot and at least one item', 400);
    }

    // Merge duplicates and validate quantities
    $want = [];
    foreach ($raw as $it) {
        $id = (int)($it['id'] ?? 0);
        $qty = (int)($it['quantity'] ?? 0);
        if ($id < 1 || $qty < 1) throw new ApiError('Invalid item or quantity', 400);
        $want[$id] = ($want[$id] ?? 0) + $qty;
    }
    foreach ($want as $qty) {
        if ($qty > 20) throw new ApiError('You can order at most 20 of one item', 400);
    }
    ksort($want); // consistent lock order avoids deadlocks

    $pdo->beginTransaction();
    try {
        // Lock the slot so two students can't take the last place together
        $q = $pdo->prepare(
            'SELECT max_orders,
                    (slot_date < CURDATE()
                      OR (slot_date = CURDATE() AND start_time <= CURTIME())) AS is_past
             FROM time_slots WHERE id = ? FOR UPDATE'
        );
        $q->execute([$slotId]);
        $slot = $q->fetch();
        if (!$slot) throw new ApiError('Pickup slot not found', 404);
        if ($slot['is_past']) throw new ApiError('That pickup slot has already passed', 400);

        $q = $pdo->prepare("SELECT COUNT(*) AS n FROM orders WHERE slot_id = ? AND status <> 'cancelled'");
        $q->execute([$slotId]);
        if ((int)$q->fetch()['n'] >= (int)$slot['max_orders']) {
            throw new ApiError('That pickup slot is full. Please choose another.', 409);
        }

        // Lock each item, check stock, and take prices from the database
        $sel = $pdo->prepare(
            'SELECT id, name, price, stock_qty, is_available FROM menu_items WHERE id = ? FOR UPDATE'
        );
        $lines = [];
        $total = 0;
        foreach ($want as $id => $qty) {
            $sel->execute([$id]);
            $item = $sel->fetch();
            if (!$item) throw new ApiError('An item in your cart no longer exists', 400);
            if (!$item['is_available']) {
                throw new ApiError("{$item['name']} is currently unavailable", 409);
            }
            if ((int)$item['stock_qty'] < $qty) {
                throw new ApiError("Only {$item['stock_qty']} of {$item['name']} left", 409);
            }
            $lines[] = [$id, $qty, $item['price']];
            $total += (float)$item['price'] * $qty;
        }

        $token = make_token($pdo);
        $pdo->prepare(
            'INSERT INTO orders (token, user_id, slot_id, total_amount) VALUES (?, ?, ?, ?)'
        )->execute([$token, $userId, $slotId, round($total, 2)]);
        $orderId = (int)$pdo->lastInsertId();

        $insItem = $pdo->prepare(
            'INSERT INTO order_items (order_id, menu_item_id, quantity, unit_price) VALUES (?, ?, ?, ?)'
        );
        $dec = $pdo->prepare('UPDATE menu_items SET stock_qty = stock_qty - ? WHERE id = ?');
        foreach ($lines as [$id, $qty, $price]) {
            $insItem->execute([$orderId, $id, $qty, $price]);
            $dec->execute([$qty, $id]);
        }

        $pdo->commit();
        return ['id' => $orderId, 'token' => $token, 'total' => round($total, 2)];
    } catch (Throwable $e) {
        if ($pdo->inTransaction()) $pdo->rollBack();
        throw $e;
    }
}

try {
    // ================= HEALTH =================
    if ($method === 'GET' && $path === '/health') {
        $n = $pdo->query('SELECT COUNT(*) AS n FROM menu_items')->fetch()['n'];
        json_out(['status' => 'ok', 'menuItems' => (int)$n]);
    }

    // ================= AUTH =================
    if ($method === 'POST' && $path === '/auth/register') {
        $b = get_body();
        $name = trim($b['name'] ?? '');
        $sid = trim($b['student_id'] ?? '');
        $email = trim($b['email'] ?? '');
        $pass = $b['password'] ?? '';

        if (!$name || !$sid || !$email || !$pass) {
            json_out(['message' => 'All fields are required'], 400);
        }
        if (strlen($pass) < 6) {
            json_out(['message' => 'Password must be at least 6 characters'], 400);
        }

        $q = $pdo->prepare('SELECT id FROM users WHERE email = ? OR student_id = ?');
        $q->execute([$email, $sid]);
        if ($q->fetch()) {
            json_out(['message' => 'Email or student ID already registered'], 409);
        }

        $q = $pdo->prepare(
            'INSERT INTO users (name, student_id, email, password_hash, role) VALUES (?, ?, ?, ?, ?)'
        );
        $q->execute([$name, $sid, $email, password_hash($pass, PASSWORD_BCRYPT), 'student']);
        json_out(['message' => 'Registered successfully'], 201);
    }

    if ($method === 'POST' && $path === '/auth/login') {
        $b = get_body();
        $email = trim($b['email'] ?? '');
        $pass = $b['password'] ?? '';

        if (!$email || !$pass) {
            json_out(['message' => 'Email and password are required'], 400);
        }

        $q = $pdo->prepare('SELECT * FROM users WHERE email = ?');
        $q->execute([$email]);
        $user = $q->fetch();

        if (!$user || !password_verify($pass, $user['password_hash'])) {
            json_out(['message' => 'Invalid email or password'], 401);
        }

        $token = jwt_encode([
            'id' => (int)$user['id'],
            'role' => $user['role'],
            'name' => $user['name'],
            'iat' => time(),
            'exp' => time() + 86400,
        ]);

        json_out([
            'token' => $token,
            'user' => [
                'id' => (int)$user['id'],
                'name' => $user['name'],
                'email' => $user['email'],
                'role' => $user['role'],
            ],
        ]);
    }

    if ($method === 'GET' && $path === '/auth/me') {
        $auth = require_auth();
        $q = $pdo->prepare('SELECT id, name, email, role, student_id FROM users WHERE id = ?');
        $q->execute([$auth['id']]);
        $user = $q->fetch();
        if (!$user) json_out(['message' => 'User not found'], 404);
        json_out($user);
    }

    // ================= MENU =================
    if ($method === 'GET' && $path === '/menu') {
        require_auth();
        json_out($pdo->query('SELECT * FROM menu_items ORDER BY category, name')->fetchAll());
    }

    if ($method === 'POST' && $path === '/menu') {
        $u = require_auth();
        require_role($u, 'staff');
        $b = get_body();
        $name = trim($b['name'] ?? '');
        $category = trim($b['category'] ?? '');
        $price = $b['price'] ?? '';
        $stock = $b['stock_qty'] ?? 0;
        $img = !empty($b['image_url']) ? $b['image_url'] : null;

        if (!$name || !$category || $price === '') {
            json_out(['message' => 'Name, category and price are required'], 400);
        }
        if ((float)$price < 0 || (int)$stock < 0) {
            json_out(['message' => 'Price and stock cannot be negative'], 400);
        }
        $q = $pdo->prepare(
            'INSERT INTO menu_items (name, category, price, stock_qty, image_url) VALUES (?, ?, ?, ?, ?)'
        );
        $q->execute([$name, $category, $price, (int)$stock, $img]);
        json_out(['message' => 'Item added', 'id' => (int)$pdo->lastInsertId()], 201);
    }

    if ($method === 'PUT' && preg_match('#^/menu/(\d+)$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'staff');
        $b = get_body();
        $name = trim($b['name'] ?? '');
        $category = trim($b['category'] ?? '');
        $price = $b['price'] ?? '';
        $stock = $b['stock_qty'] ?? 0;
        $img = !empty($b['image_url']) ? $b['image_url'] : null;

        if (!$name || !$category || $price === '') {
            json_out(['message' => 'Name, category and price are required'], 400);
        }
        if ((float)$price < 0 || (int)$stock < 0) {
            json_out(['message' => 'Price and stock cannot be negative'], 400);
        }
        if (!row_exists($pdo, 'menu_items', $m[1])) {
            json_out(['message' => 'Item not found'], 404);
        }
        $q = $pdo->prepare(
            'UPDATE menu_items SET name = ?, category = ?, price = ?, stock_qty = ?, image_url = ? WHERE id = ?'
        );
        $q->execute([$name, $category, $price, (int)$stock, $img, $m[1]]);
        json_out(['message' => 'Item updated']);
    }

    if ($method === 'PATCH' && preg_match('#^/menu/(\d+)/availability$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'staff');
        if (!row_exists($pdo, 'menu_items', $m[1])) {
            json_out(['message' => 'Item not found'], 404);
        }
        $pdo->prepare('UPDATE menu_items SET is_available = NOT is_available WHERE id = ?')->execute([$m[1]]);
        json_out(['message' => 'Availability updated']);
    }

    if ($method === 'DELETE' && preg_match('#^/menu/(\d+)$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'staff');
        if (!row_exists($pdo, 'menu_items', $m[1])) {
            json_out(['message' => 'Item not found'], 404);
        }
        try {
            $pdo->prepare('DELETE FROM menu_items WHERE id = ?')->execute([$m[1]]);
            json_out(['message' => 'Item deleted']);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) == 1451) {
                json_out(['message' => 'This item is in past orders. Mark it unavailable instead of deleting.'], 409);
            }
            throw $e;
        }
    }

    // ================= SLOTS =================
    if ($method === 'GET' && $path === '/slots') {
        require_auth();
        $q = $pdo->prepare(
            "SELECT s.id,
                    DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
                    TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(s.end_time, '%H:%i') AS end_time,
                    s.max_orders,
                    COUNT(o.id) AS booked,
                    (s.slot_date < CURDATE()
                      OR (s.slot_date = CURDATE() AND s.start_time <= CURTIME())) AS is_past
             FROM time_slots s
             LEFT JOIN orders o ON o.slot_id = s.id AND o.status <> 'cancelled'
             WHERE s.slot_date = COALESCE(?, CURDATE())
             GROUP BY s.id
             ORDER BY s.start_time"
        );
        $q->execute([$_GET['date'] ?? null]);
        $rows = array_map(function ($r) {
            $r['id'] = (int)$r['id'];
            $r['max_orders'] = (int)$r['max_orders'];
            $r['booked'] = (int)$r['booked'];
            $r['is_past'] = (bool)$r['is_past'];
            $r['remaining'] = max($r['max_orders'] - $r['booked'], 0);
            return $r;
        }, $q->fetchAll());
        json_out($rows);
    }

    if ($method === 'POST' && $path === '/slots') {
        $u = require_auth();
        require_role($u, 'staff');
        $b = get_body();
        $date = $b['slot_date'] ?? '';
        $from = $b['start_time'] ?? '';
        $to = $b['end_time'] ?? '';
        $step = (int)($b['interval_minutes'] ?? 0);
        $max = (int)($b['max_orders'] ?? 0);

        if (!$date || !$from || !$to || !$step || !$max) {
            json_out(['message' => 'All fields are required'], 400);
        }
        $start = to_min($from);
        $end = to_min($to);
        if ($end <= $start) json_out(['message' => 'End time must be after start time'], 400);
        if ($step < 5 || $step > 120) json_out(['message' => 'Interval must be between 5 and 120 minutes'], 400);
        if ($max < 1) json_out(['message' => 'Max orders must be at least 1'], 400);

        $ins = $pdo->prepare(
            'INSERT IGNORE INTO time_slots (slot_date, start_time, end_time, max_orders) VALUES (?, ?, ?, ?)'
        );
        $created = 0;
        for ($t = $start; $t + $step <= $end; $t += $step) {
            $ins->execute([$date, to_time($t), to_time($t + $step), $max]);
            $created += $ins->rowCount();
        }
        json_out(['message' => "$created slot(s) created", 'created' => $created], 201);
    }

    if ($method === 'DELETE' && preg_match('#^/slots/(\d+)$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'staff');
        if (!row_exists($pdo, 'time_slots', $m[1])) {
            json_out(['message' => 'Slot not found'], 404);
        }
        try {
            $pdo->prepare('DELETE FROM time_slots WHERE id = ?')->execute([$m[1]]);
            json_out(['message' => 'Slot deleted']);
        } catch (PDOException $e) {
            if (($e->errorInfo[1] ?? 0) == 1451) {
                json_out(['message' => 'This slot already has orders and cannot be deleted'], 409);
            }
            throw $e;
        }
    }

    // ================= ORDERS (student) =================
    if ($method === 'POST' && $path === '/orders') {
        $u = require_auth();
        require_role($u, 'student');
        try {
            $result = place_order($pdo, (int)$u['id'], get_body());
            json_out(['message' => 'Order placed', 'order' => $result], 201);
        } catch (ApiError $e) {
            json_out(['message' => $e->getMessage()], $e->getCode() ?: 400);
        }
    }

    if ($method === 'GET' && $path === '/orders/my') {
        $u = require_auth();
        require_role($u, 'student');
        $q = $pdo->prepare(
            "SELECT o.id, o.token, o.total_amount, o.status, o.payment_status, o.created_at,
                    DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
                    TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                    TIME_FORMAT(s.end_time, '%H:%i') AS end_time
             FROM orders o JOIN time_slots s ON s.id = o.slot_id
             WHERE o.user_id = ?
             ORDER BY o.created_at DESC, o.id DESC"
        );
        $q->execute([$u['id']]);
        $orders = $q->fetchAll();

        $itemsQ = $pdo->prepare(
            'SELECT m.name, oi.quantity, oi.unit_price
             FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
             WHERE oi.order_id = ?'
        );
        foreach ($orders as &$o) {
            $o['id'] = (int)$o['id'];
            $o['total_amount'] = (float)$o['total_amount'];
            $itemsQ->execute([$o['id']]);
            $o['items'] = array_map(function ($i) {
                $i['quantity'] = (int)$i['quantity'];
                $i['unit_price'] = (float)$i['unit_price'];
                return $i;
            }, $itemsQ->fetchAll());
        }
        unset($o);
        json_out($orders);
    }

    if ($method === 'PATCH' && preg_match('#^/orders/(\d+)/cancel$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'student');
        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('SELECT status FROM orders WHERE id = ? AND user_id = ? FOR UPDATE');
            $q->execute([$m[1], $u['id']]);
            $order = $q->fetch();
            if (!$order) {
                $pdo->rollBack();
                json_out(['message' => 'Order not found'], 404);
            }
            if ($order['status'] !== 'placed') {
                $pdo->rollBack();
                json_out(['message' => 'Only orders that are still "placed" can be cancelled'], 409);
            }
            $pdo->prepare("UPDATE orders SET status = 'cancelled' WHERE id = ?")->execute([$m[1]]);
            // Put the stock back
            $pdo->prepare(
                'UPDATE menu_items mi JOIN order_items oi ON oi.menu_item_id = mi.id
                 SET mi.stock_qty = mi.stock_qty + oi.quantity
                 WHERE oi.order_id = ?'
            )->execute([$m[1]]);
            $pdo->commit();
            json_out(['message' => 'Order cancelled']);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    // ================= IMAGE UPLOAD (staff) =================
    if ($method === 'POST' && $path === '/upload') {
        $u = require_auth();
        require_role($u, 'staff');

        if (empty($_FILES['image']) || $_FILES['image']['error'] !== UPLOAD_ERR_OK) {
            json_out(['message' => 'No image received. Please choose a file under 2 MB.'], 400);
        }
        $f = $_FILES['image'];
        if ($f['size'] > 2 * 1024 * 1024) {
            json_out(['message' => 'Image must be smaller than 2 MB'], 400);
        }

        $info = @getimagesize($f['tmp_name']);
        $types = [IMAGETYPE_JPEG => 'jpg', IMAGETYPE_PNG => 'png', IMAGETYPE_WEBP => 'webp'];
        if (!$info || !isset($types[$info[2]])) {
            json_out(['message' => 'Only JPG, PNG or WEBP images are allowed'], 400);
        }

        $public = realpath('C:\Users\LENOVO\Downloads\canteen-app\frontend\public');
        if (!$public) {
            json_out(['message' => 'frontend/public folder not found next to backend-php'], 500);
        }
        $dir = $public . DIRECTORY_SEPARATOR . 'images';
        if (!is_dir($dir) && !mkdir($dir, 0775, true)) {
            json_out(['message' => 'Could not create the images folder'], 500);
        }

        $name = 'item-' . bin2hex(random_bytes(6)) . '.' . $types[$info[2]];
        if (!move_uploaded_file($f['tmp_name'], $dir . DIRECTORY_SEPARATOR . $name)) {
            json_out(['message' => 'Could not save the image'], 500);
        }
        json_out(['url' => '/images/' . $name], 201);
    }

    // ================= PAYMENT (mock) + BILL =================
    if ($method === 'PATCH' && preg_match('#^/orders/(\d+)/pay$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'student');
        $how = get_body()['method'] ?? 'upi';
        if (!in_array($how, ['upi', 'card', 'netbanking'], true)) {
            json_out(['message' => 'Invalid payment method'], 400);
        }

        $q = $pdo->prepare('SELECT status, payment_status FROM orders WHERE id = ? AND user_id = ?');
        $q->execute([$m[1], $u['id']]);
        $order = $q->fetch();
        if (!$order) json_out(['message' => 'Order not found'], 404);
        if ($order['status'] === 'cancelled') json_out(['message' => 'This order was cancelled'], 409);
        if ($order['payment_status'] === 'paid') json_out(['message' => 'This order is already paid'], 409);

        $pdo->prepare(
            "UPDATE orders SET payment_status = 'paid', payment_method = ?, paid_at = NOW() WHERE id = ?"
        )->execute([$how, $m[1]]);
        json_out(['message' => 'Payment successful']);
    }

    if ($method === 'GET' && preg_match('#^/orders/(\d+)$#', $path, $m)) {
        $u = require_auth();
        $sql = "SELECT o.id, o.token, o.total_amount, o.status, o.payment_status,
                       o.payment_method, o.paid_at, o.created_at,
                       u.name AS student_name, u.student_id,
                       DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
                       TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                       TIME_FORMAT(s.end_time, '%H:%i') AS end_time
                FROM orders o
                JOIN users u ON u.id = o.user_id
                JOIN time_slots s ON s.id = o.slot_id
                WHERE o.id = ?";
        $params = [$m[1]];
        if ($u['role'] === 'student') {      // students can only open their own bills
            $sql .= ' AND o.user_id = ?';
            $params[] = $u['id'];
        }
        $q = $pdo->prepare($sql);
        $q->execute($params);
        $order = $q->fetch();
        if (!$order) json_out(['message' => 'Order not found'], 404);

        $order['id'] = (int)$order['id'];
        $order['total_amount'] = (float)$order['total_amount'];

        $itemsQ = $pdo->prepare(
            'SELECT m.name, oi.quantity, oi.unit_price
             FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
             WHERE oi.order_id = ?'
        );
        $itemsQ->execute([$order['id']]);
        $order['items'] = array_map(function ($i) {
            $i['quantity'] = (int)$i['quantity'];
            $i['unit_price'] = (float)$i['unit_price'];
            return $i;
        }, $itemsQ->fetchAll());
        json_out($order);
    }

    // ================= ORDERS (staff) =================
    if ($method === 'GET' && $path === '/orders') {
        $u = require_auth();
        require_role($u, 'staff');

        $where = [];
        $params = [];
        if (!empty($_GET['date'])) {
            $where[] = 's.slot_date = ?';
            $params[] = $_GET['date'];
        }
        if (!empty($_GET['status']) && $_GET['status'] !== 'all') {
            $where[] = 'o.status = ?';
            $params[] = $_GET['status'];
        }

        $sql = "SELECT o.id, o.token, o.total_amount, o.status, o.payment_status,
                       u.name AS student_name, u.student_id,
                       DATE_FORMAT(s.slot_date, '%Y-%m-%d') AS slot_date,
                       TIME_FORMAT(s.start_time, '%H:%i') AS start_time,
                       TIME_FORMAT(s.end_time, '%H:%i') AS end_time
                FROM orders o
                JOIN users u ON u.id = o.user_id
                JOIN time_slots s ON s.id = o.slot_id"
             . ($where ? ' WHERE ' . implode(' AND ', $where) : '')
             . ' ORDER BY s.slot_date, s.start_time, o.id';

        $q = $pdo->prepare($sql);
        $q->execute($params);
        $orders = $q->fetchAll();

        $itemsQ = $pdo->prepare(
            'SELECT m.name, oi.quantity
             FROM order_items oi JOIN menu_items m ON m.id = oi.menu_item_id
             WHERE oi.order_id = ?'
        );
        foreach ($orders as &$o) {
            $o['id'] = (int)$o['id'];
            $o['total_amount'] = (float)$o['total_amount'];
            $itemsQ->execute([$o['id']]);
            $o['items'] = array_map(function ($i) {
                $i['quantity'] = (int)$i['quantity'];
                return $i;
            }, $itemsQ->fetchAll());
        }
        unset($o);
        json_out($orders);
    }

    if ($method === 'PATCH' && preg_match('#^/orders/(\d+)/status$#', $path, $m)) {
        $u = require_auth();
        require_role($u, 'staff');
        $new = get_body()['status'] ?? '';

        $allowed = [
            'placed'    => ['preparing', 'cancelled'],
            'preparing' => ['ready', 'cancelled'],
            'ready'     => ['collected', 'cancelled'],
        ];

        $pdo->beginTransaction();
        try {
            $q = $pdo->prepare('SELECT status, payment_status FROM orders WHERE id = ? FOR UPDATE');
            $q->execute([$m[1]]);
            $order = $q->fetch();
            if (!$order) {
                $pdo->rollBack();
                json_out(['message' => 'Order not found'], 404);
            }
            if (!in_array($new, $allowed[$order['status']] ?? [], true)) {
                $pdo->rollBack();
                json_out(['message' => "Cannot change an order from {$order['status']} to $new"], 409);
            }
            // Food is only prepared once the order has been paid
            if ($new !== 'cancelled' && $order['payment_status'] !== 'paid') {
                $pdo->rollBack();
                json_out(['message' => 'This order has not been paid yet'], 409);
            }

            $pdo->prepare('UPDATE orders SET status = ? WHERE id = ?')->execute([$new, $m[1]]);

            if ($new === 'cancelled') {
                $pdo->prepare(
                    'UPDATE menu_items mi JOIN order_items oi ON oi.menu_item_id = mi.id
                     SET mi.stock_qty = mi.stock_qty + oi.quantity
                     WHERE oi.order_id = ?'
                )->execute([$m[1]]);
            }
            $pdo->commit();
            json_out(['message' => "Order marked $new"]);
        } catch (PDOException $e) {
            if ($pdo->inTransaction()) $pdo->rollBack();
            throw $e;
        }
    }

    json_out(['message' => 'Route not found'], 404);

} catch (Throwable $e) {
    error_log($e->getMessage());
    json_out(['message' => 'Server error'], 500);
}