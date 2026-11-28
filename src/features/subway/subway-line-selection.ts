import {
  SUBWAY_LINES,
  type SubwayLineNumber,
} from "./subway-constants";

export interface SubwayLineSelectionAction {
  type: "toggle" | "select-only" | "select-all" | "clear";
  lineNumber?: SubwayLineNumber;
}

export function createInitialSelectedLineNumberSet(): Set<SubwayLineNumber> {
  return new Set(SUBWAY_LINES);
}

export function selectedLineNumberSetReducer(
  selectedLineNumberSet: Set<SubwayLineNumber>,
  action: SubwayLineSelectionAction,
): Set<SubwayLineNumber> {
  switch (action.type) {
    case "toggle": {
      if (action.lineNumber === undefined) {
        return selectedLineNumberSet;
      }

      const nextSelectedLineNumberSet = new Set(selectedLineNumberSet);

      if (nextSelectedLineNumberSet.has(action.lineNumber)) {
        nextSelectedLineNumberSet.delete(action.lineNumber);
        return nextSelectedLineNumberSet;
      }

      nextSelectedLineNumberSet.add(action.lineNumber);
      return nextSelectedLineNumberSet;
    }

    case "select-only":
      return action.lineNumber === undefined
        ? selectedLineNumberSet
        : new Set([action.lineNumber]);

    case "select-all":
      return createInitialSelectedLineNumberSet();

    case "clear":
      return new Set();
  }
}

export function getSelectedLineNumbers(
  selectedLineNumberSet: ReadonlySet<SubwayLineNumber>,
): SubwayLineNumber[] {
  return SUBWAY_LINES.filter((lineNumber) =>
    selectedLineNumberSet.has(lineNumber),
  );
}
