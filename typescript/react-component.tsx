import React from 'react';

// TypeScript React component
interface GreetingProps {
  name: string;
}

const Greeting: React.FC<GreetingProps> = ({ name }) => {
  return (
    <div className="greeting">
      <h1>Hello, {name}!</h1>
      <p>This is a TypeScript React component.</p>
    </div>
  );
};

export default Greeting;
