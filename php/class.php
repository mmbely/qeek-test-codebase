<?php
// PHP class example
class Person {
    private $name;
    private $age;

    public function __construct($name, $age) {
        $this->name = $name;
        $this->age = $age;
    }

    public function greet() {
        return "Hello, my name is {$this->name} and I'm {$this->age} years old.";
    }
}

$person = new Person("Bob", 25);
echo $person->greet();
?>
