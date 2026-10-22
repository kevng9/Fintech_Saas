/**
 * Shared response guidance appended to every live Aura Analyst question.
 *
 * Keeping this at the proxy layer makes the behavior consistent across all
 * anchors and sessions, including questions typed by a user rather than chosen
 * from the curated starter list.
 */
export const DATA_COMMENTARY_HINT =
  "Required answer shape whenever a table or chart is returned:\n" +
  "1. One opening sentence that states the main comparison and bolds the key figure.\n" +
  "2. A Markdown bullet list of the key figures, with each figure in **bold**.\n" +
  "3. One closing sentence on what the pattern may mean, including any limitation.\n" +
  "Return one table only. Do not return a second table that repeats the same comparison.\n" +
  "Do not claim causation or recommend a regulated action. Do not put Markdown inside table cells.";
