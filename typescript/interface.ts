// TypeScript interface example
interface User {
  id: number;
  name: string;
  email: string;
  isActive: boolean;
}

function printUserInfo(user: User): void {
  console.log(`User ${user.name} (${user.email}) is ${user.isActive ? 'active' : 'inactive'}`);
}

function isActive(user: User): void {
  console.log(`User active status: ${user.isActive}`);
}

const sampleUser: User = {
  id: 1,
  name: 'John Doe',
  email: 'john@example.com',
  isActive: true
};


printUserInfo(sampleUser);
