import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import PhoneFlow from "./pages/PhoneFlow.jsx";
import KioskScreen from "./pages/KioskScreen.jsx";
import AdminPage from "./pages/AdminPage.jsx";

const router = createBrowserRouter([
  { path: "/", element: <PhoneFlow /> }, // customer phone web app (QR opens this)
  { path: "/kiosk", element: <KioskScreen /> }, // the tablet kiosk screen
  { path: "/admin", element: <AdminPage /> }, // super admin: operators, kiosks, QR
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
