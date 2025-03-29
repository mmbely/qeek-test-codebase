# Python class example
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def greet(self):
        return f"Hello, my name is {self.name} and I'm {self.age} years old."

    def birthday(self):
        self.age += 1
        return f"Happy Birthday! You are now {self.age} years old."

    def capitalize_name(self):
        self.name = self.name.capitalize()
        return f"Name capitalized: {self.name}"

if __name__ == "__main__":
    person = Person("alice", 30)
    print(person.greet())
    print(person.birthday())
    print(person.capitalize_name())
