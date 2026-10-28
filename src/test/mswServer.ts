import { setupServer } from 'msw/node'

/** Single MSW server for the whole test run; lifecycle is managed in `setup.ts`. */
export const server = setupServer()
