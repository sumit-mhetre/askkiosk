import React from "react";
import ReactDOM from "react-dom/client";
import { createBrowserRouter, RouterProvider } from "react-router-dom";
import "./index.css";
import PhoneFlow from "./pages/PhoneFlow.jsx";
import KioskScreen from "./pages/KioskScreen.jsx";
import AdminPage from "./pages/AdminPage.jsx";

const router = createBrowserRouter([
  { path: "/", element: <AdminPage /> },          // login + admin dashboard
  { path: "/admin", element: <AdminPage /> },      // same admin (alias)
  { path: "/print", element: <PhoneFlow /> },      // customer upload (QR opens this)
  { path: "/kiosk", element: <KioskScreen /> },    // kiosk screen on the tablet
]);

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <RouterProvider router={router} />
  </React.StrictMode>
);
