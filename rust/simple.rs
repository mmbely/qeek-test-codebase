// Simple Rust example
fn greet(name: &str) -> String {
    format!("Hello, {}!", name)
}

fn farewell(name: &str) -> String {
    format!("Goodbye, {}!", name)
}

fn main() {
    let message = greet("World");
    println!("{}", message);
    println!("{}", farewell("World"));
}
