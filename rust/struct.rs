// Rust struct example
struct Person {
    name: String,
    age: u8,
}

impl Person {
    fn greet(&self) -> String {
        format!("Hello, my name is {} and I'm {} years old", self.name, self.age)
    }
}

fn main() {
    let person = Person {
        name: String::from("Eve"),
        age: 45,
    };
    println!("{}", person.greet());
}
