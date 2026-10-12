<?php
function json_out($data, $code = 200) {
    http_response_code($code);
    echo json_encode($data);
    exit;
}

function get_body() {
    $data = json_decode(file_get_contents('php://input'), true);
    return is_array($data) ? $data : [];
}

function b64url($data) {
    return rtrim(strtr(base64_encode($data), '+/', '-_'), '=');
}

function jwt_encode($payload) {
    $header = b64url(json_encode(['alg' => 'HS256', 'typ' => 'JWT']));
    $body = b64url(json_encode($payload));
    $sig = b64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    return "$header.$body.$sig";
}

function jwt_decode($token) {
    $parts = explode('.', $token);
    if (count($parts) !== 3) return null;
    [$header, $body, $sig] = $parts;
    $expected = b64url(hash_hmac('sha256', "$header.$body", JWT_SECRET, true));
    if (!hash_equals($expected, $sig)) return null;
    $payload = json_decode(base64_decode(strtr($body, '-_', '+/')), true);
    if (!$payload || ($payload['exp'] ?? 0) < time()) return null;
    return $payload;
}

// Returns the logged-in user's token data, or stops with 401
function require_auth() {
    $header = $_SERVER['HTTP_AUTHORIZATION']
        ?? $_SERVER['REDIRECT_HTTP_AUTHORIZATION']
        ?? (function_exists('getallheaders') ? (getallheaders()['Authorization'] ?? '') : '');

    if (!$header || stripos($header, 'Bearer ') !== 0) {
        json_out(['message' => 'Not logged in'], 401);
    }
    $payload = jwt_decode(trim(substr($header, 7)));
    if (!$payload) {
        json_out(['message' => 'Invalid or expired token'], 401);
    }
    return $payload;
}

function require_role($user, ...$roles) {
    if (!in_array($user['role'], $roles, true)) {
        json_out(['message' => 'Access denied'], 403);
    }
}