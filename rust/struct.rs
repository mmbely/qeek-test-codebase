// Rust struct example
struct Person {
    name: String,
    age: u8,
}

impl Person {
    fn greet(&self) -> String {
        format!("Hello, my name is {} and I'm {} years old", self.name, self.age)
    }

    fn birthday(&mut self) -> String {
        self.age += 1;
        format!("Happy Birthday! You are now {} years old", self.age)
    }
}

fn main() {
    let mut person = Person {
        name: String::from("Eve"),
        age: 45,
    };
    println!("{}", person.greet());
    println!("{}", person.birthday());
}
