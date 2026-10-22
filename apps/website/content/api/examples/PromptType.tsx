// Choose the input style for a prompt.
import { prompt, type PromptType } from 'kuito';

async function ask(title: string, type: PromptType) {
  const answer = await prompt({ title, type });

  return answer?.value ?? null;
}

const pin = await ask('Enter your PIN', 'password');
const login = await ask('Sign in to Wi-Fi', 'login'); // { username, password }
