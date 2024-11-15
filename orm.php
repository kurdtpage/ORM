<?php

$dev_server_ip = '10.177.65.70'; //change this to the dev server IP

header('Access-Control-Allow-Origin: *'); //stop CORS

//default values for array. order is preserved
$a_json = array();
$a_json['success'] = 'Y';
$a_json['data'] = [];
$a_json['error'] = '';

if (empty($_REQUEST)) {
	$a_json['success'] = 'N';
	$a_json['error'] = 'Empty request';
	echo json_encode($a_json);
	exit;
}

require_once '../inc/connect.php';

$sql = $_REQUEST['sql']; //string
$a_json['nice_sql'] = $sql;
$params = empty($_REQUEST['params']) ? [] : $_REQUEST['params']; //array

if (stristr($_SERVER['REMOTE_ADDR'], $dev_server_ip)) {
	$a_json['sql'] = $sql;
	$a_json['params'] = $params;
}

if (!is_array($params)) {
	$params = explode(',', $params); //convert to array
}
$a_json['params'] = $params;

//manual override for clientip() and serverip()
if (stristr($sql, 'clientip()')) {
	$sql = str_ireplace('clientip()', "'" . $_SERVER['REMOTE_ADDR'] . "'", $sql);
}
if (stristr($sql, 'serverip()')) {
	$sql = str_ireplace('serverip()', "'" . $_SERVER['SERVER_ADDR'] . "'", $sql);
}
if (in_array('clientip()', $params)) {
	$params = array_replace(
		$params,
		array_fill_keys(
			array_keys($params, 'clientip()'),
			$_SERVER['REMOTE_ADDR']
		)
	);
}
if (in_array('serverip()', $params)) {
	$params = array_replace(
		$params,
		array_fill_keys(
			array_keys($params, 'serverip()'),
			$_SERVER['SERVER_ADDR']
		)
	);
}

$a_json['nice_sql'] = niceQuery($sql, $params);

//prepare
if (!$orm = $pdo->prepare($sql)) {
	$a_json['error'] .= $pdo->error . PHP_EOL . $sql;
	$a_json['success'] = 'N';
}

//execute
if ($a_json['success'] == 'Y') {
	if (!stristr($sql, '?')) {
		if (!$orm->execute()) {
			$a_json['error'] .= 'ORM error executing' . PHP_EOL;
		}
	} else {
		if (!$orm->execute($params)) {
			$a_json['error'] .= 'ORM error executing params' . PHP_EOL;
			$a_json['error'] .= 'sql: "' . $sql . '"' . PHP_EOL;
			$a_json['error'] .= 'params(' . count($params) . '): "' . implode(',', $params) . '"' . PHP_EOL;
		}
	}
}

//errors
if (!empty($pdo->error)) {
	$a_json['error'] .= $pdo->error . PHP_EOL;
}
if (!empty($orm->error)) {
	$a_json['error'] .= $orm->error . PHP_EOL;
}
if (!empty($a_json['error'])) {
	$a_json['error'] .= $sql;
	$a_json['success'] = 'N';
}

//fetch
if (stristr($sql, 'select ') && $a_json['success'] == 'Y') {
	//if select query, output results
	$a_json['data'] = $orm->fetchAll();
}

if ($a_json['error'] == '') {
	unset($a_json['error']);
}

echo json_encode($a_json);
