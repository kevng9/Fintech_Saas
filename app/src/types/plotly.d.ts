/**
 * Minimal declaration for the Plotly distribution bundle.
 *
 * The package ships no types. Only the two functions the Analyst chart uses are
 * declared, so a typo in a call site is still caught.
 */
declare module "plotly.js-dist-min" {
  export function newPlot(
    element: HTMLElement,
    data: unknown[],
    layout?: Record<string, unknown>,
    config?: Record<string, unknown>
  ): Promise<unknown>;

  export function purge(element: HTMLElement): void;

  const plotly: {
    newPlot: typeof newPlot;
    purge: typeof purge;
  };
  export default plotly;
}
