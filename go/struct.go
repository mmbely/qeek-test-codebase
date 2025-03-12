package main

import "fmt"

type Person struct {
    Name string
    Age  int
}

func (p Person) Greet() string {
    return fmt.Sprintf("Hello, my name is %s and I'm %d years old", p.Name, p.Age)
}

func main() {
    person := Person{Name: "Dave", Age: 40}
    fmt.Println(person.Greet())
}
