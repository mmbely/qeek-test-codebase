# Ruby class example
class Person
  attr_accessor :name, :age

  def initialize(name, age)
    @name = name
    @age = age
  end

  def greet
    "Hello, my name is #{@name} and I'm #{@age} years old."
  end

  def birthday
    @age += 1
    "Happy Birthday! You are now #{@age} years old."
  end
end

person = Person.new("Charlie", 35)
puts person.greet
puts person.birthday
