/**
 * Building blocks for tool dashboards (`ui: () => import("./ui/Dashboard.tsx")`).
 * Import from here rather than from individual files.
 */

export { colors, icons } from "../output/palette.ts";
export { FILE_BROWSER_HINTS, FileBrowser, type FileBrowserProps } from "./components/FileBrowser.tsx";
export { type KeyHint, KeyHints } from "./components/KeyHints.tsx";
export { MASCOT_HEIGHT, MASCOT_WIDTH, Mascot } from "./components/Mascot.tsx";
export { OPTIONS_FORM_HINTS, OptionsForm, type OptionsFormProps } from "./components/OptionsForm.tsx";
export { type ItemStatus, ProgressBar, type ProgressItem, ProgressList } from "./components/ProgressList.tsx";
export { type ResultColumn, ResultTable } from "./components/ResultTable.tsx";
export { Screen, type ScreenProps } from "./components/Screen.tsx";
export { type SelectItem, SelectList, type SelectListProps } from "./components/SelectList.tsx";
export { Spinner } from "./components/Spinner.tsx";
export { StatusBar, type Tone } from "./components/StatusBar.tsx";
export { TextInput, type TextInputProps } from "./components/TextInput.tsx";
export { TEXT_VIEWER_HINTS, TextViewer, type TextViewerProps } from "./components/TextViewer.tsx";
export { useBtk } from "./context.tsx";
export { type FormField, fieldsFromArgs, initialValues, labelFor } from "./form-fields.ts";
export { useListCursor } from "./hooks/use-list-cursor.ts";
export { useTerminalSize } from "./hooks/use-terminal-size.ts";
export { type Navigation, type ScreenEntry, useNavigation, useScreenActive } from "./navigation.tsx";
