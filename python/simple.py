# Simple Python example
def greet(name):
    return f"Hello, {name}!"

def farewell(name):
    return f"Goodbye, {name}!"

def capitalize(name):
    return name.capitalize()

if __name__ == "__main__":
    message = greet("World")
    print(message)
    print(farewell("World"))
    print(capitalize("world"))
