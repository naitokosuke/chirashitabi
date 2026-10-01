/** One choice in a tab list, segmented control or tab bar */
export interface CtOption<V extends string = string> {
  value: V;
  label: string;
}
