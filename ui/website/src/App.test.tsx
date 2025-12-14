import React from 'react';
import { render, screen } from '@testing-library/react';
import App from './App';

test('renders main panes', () => {
  render(<App />);
  expect(screen.getByText(/filetree/i)).toBeInTheDocument();
  expect(screen.getByText(/control panel/i)).toBeInTheDocument();
  expect(screen.getByText(/codeview/i)).toBeInTheDocument();
  expect(screen.getByText(/astview/i)).toBeInTheDocument();
});
