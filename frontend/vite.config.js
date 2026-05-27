import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    host: true, // allow access from phone on same network
    proxy: {
      "/api": "http://localhost:5000",
    },
  },
});
