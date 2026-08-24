import { createRoot } from "react-dom/client";
import { Desktop } from "@/components/desktop/Desktop";
import "./styles.css";

const root = document.getElementById("root");
if (!root) throw new Error("missing #root");
createRoot(root).render(<Desktop />);
