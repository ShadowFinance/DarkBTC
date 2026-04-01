import { InjectedConnector } from 'starknetkit/injected';
import { WebWalletConnector } from 'starknetkit/webwallet';
import { ControllerConnector } from 'starknetkit/controller';

export const walletConnectors = [
  new ControllerConnector(),
  new InjectedConnector({ options: { id: 'argentX' } }),
  new InjectedConnector({ options: { id: 'braavos' } }),
  new WebWalletConnector({ url: 'https://web.ready.co' }),
];
