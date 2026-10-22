/**
 * Shared response guidance appended to every live Aura Analyst question.
 *
 * Keeping this at the proxy layer makes the behavior consistent across all
 * anchors and sessions, including questions typed by a user rather than chosen
 * from the curated starter list.
 */
export const DATA_COMMENTARY_HINT =
  "Write the answer in Simplified Technical English (ASD-STE100).\n" +
  "Use 20 words or fewer in each sentence.\n" +
  "Put one fact in each sentence.\n" +
  "Use the active voice and plain words.\n" +
  "Do not use idioms.\n" +
  "Do not write a sentence that only repeats the table.\n" +
  "Required answer shape when you return a table or a chart:\n" +
  "1. One opening sentence. State the main comparison. Put the key figure in **bold**.\n" +
  "2. A Markdown bullet list of the key figures. Put each figure in **bold**. Put one fact in each bullet.\n" +
  "3. A line that contains only **Next check**. Then write three or four sentences under it:\n" +
  "- Name the row or group that differs.\n" +
  "- Name one review or one test a person can do next. Use only figures from the result.\n" +
  "- State that this result does not prove a cause.\n" +
  "- State who keeps the decision.\n" +
  "Return one table only. Do not return a second table that repeats the same comparison.\n" +
  "Do not put Markdown inside table cells.\n" +
  "A next check is a review or a test. It is not a completed decision.\n" +
  "Do not approve, decline, close, file, release, transfer, price, or change a rule.\n" +
  "Do not tell a customer how to spend, save, or invest.\n" +
  "Do not say that a customer committed fraud.";
