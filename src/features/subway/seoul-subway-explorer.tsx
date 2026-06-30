import { useReducer } from "react";
import { SeoulSubwayMap } from "../../components/seoul-subway-map";
import { SubwayLineInspector } from "../../components/subway-line-inspector";
import {
  createInitialSelectedLineNumberSet,
  getSelectedLineNumbers,
  selectedLineNumberSetReducer,
} from "./subway-line-selection";

export function SeoulSubwayExplorer() {
  const [selectedLineNumberSet, dispatchSelectedLineNumberSet] = useReducer(
    selectedLineNumberSetReducer,
    undefined,
    createInitialSelectedLineNumberSet,
  );

  const selectedLineNumbers = getSelectedLineNumbers(selectedLineNumberSet);

  return (
    <div className="relative h-screen w-screen">
      <SeoulSubwayMap selectedLineNumbers={selectedLineNumbers} />
      <SubwayLineInspector
        className="absolute left-4 top-4 z-10"
        selectedLineNumberSet={selectedLineNumberSet}
        dispatchSelectedLineNumberSet={dispatchSelectedLineNumberSet}
      />
    </div>
  );
}
