export const disabledTransport = {
  name: 'disabled',
  async send() { throw new Error('Aucun transport email configuré.'); },
};
