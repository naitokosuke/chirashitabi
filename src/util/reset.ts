/**
 * What the standard library types as `any`, typed as `unknown` instead, for the app and the
 * Worker alike: JSON from outside is checked field by field before it is used, never assumed.
 * These overloads come first, so they are the ones a call picks.
 */

declare global {
  interface Body {
    json(): Promise<unknown>;
  }

  interface JSON {
    parse(text: string, reviver?: (this: unknown, key: string, value: unknown) => unknown): unknown;
  }

  interface ArrayConstructor {
    isArray(arg: unknown): arg is unknown[];
  }
}

export {};
