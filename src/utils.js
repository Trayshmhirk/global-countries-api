// small helpers
module.exports = {
  pickFirstCurrency: (currencies) => {
    if (!Array.isArray(currencies) || currencies.length === 0) return null;
    const c = currencies[0];
    return c && c.code ? c.code : null;
  },
};
