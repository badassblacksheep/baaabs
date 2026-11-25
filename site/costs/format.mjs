export const money = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD'});
export const dollars = new Intl.NumberFormat('en-US', {style: 'currency', currency: 'USD', maximumFractionDigits: 0});
const percent = new Intl.NumberFormat('en-US', {style:'percent', maximumFractionDigits:1});

export function share(cents, total) {
  return percent.format(total ? cents / total : 0);
}
export function amount(cents, estimated) {
  return estimated ? '≈' + dollars.format(cents / 100) : money.format(cents / 100);
}
export function chartValue(cents, estimated, total, mode) {
  return mode === 'hundred' ? money.format(total ? 100 * cents / total : 0) : amount(cents, estimated);
}
