// Java interface example
interface Greetable {
    String greet(String name);
}

class Greeter implements Greetable {
    public String greet(String name) {
        return "Hello, " + name + "!";
    }
}

public class Interface {
    public static void main(String[] args) {
        Greetable greeter = new Greeter();
        System.out.println(greeter.greet("World"));
    }
}
