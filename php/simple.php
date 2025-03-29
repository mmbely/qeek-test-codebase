<?php
// Simple PHP example
function greet($name) {
    return "Hello, $name!";
}

function farewell($name) {
    return "Goodbye, $name!";
}

function capitalize($name) {
    return ucfirst($name);
}

$message = greet("World");
echo $message . "\n";
echo farewell("World") . "\n";
echo capitalize("world") . "\n";
?>
