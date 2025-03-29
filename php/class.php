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

    public function birthday() {
        $this->age++;
        return "Happy Birthday! You are now {$this->age} years old.";
    }

    public function capitalizeName() {
        $this->name = ucfirst($this->name);
        return "Name capitalized: {$this->name}";
    }
}

$person = new Person("bob", 25);
echo $person->greet() . "\n";
echo $person->birthday() . "\n";
echo $person->capitalizeName() . "\n";
?>
