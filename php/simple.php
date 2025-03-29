<?php
// Simple PHP example
function greet($name) {
    return "Hello, $name!";
}

function farewell($name) {
    return "Goodbye, $name!";
}

$message = greet("World");
echo $message . "\n";
echo farewell("World") . "\n";
?>
