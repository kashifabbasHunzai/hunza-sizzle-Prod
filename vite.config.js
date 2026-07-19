import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// If you deploy to GitHub Pages under https://USER.github.io/REPO/,
// set base to "/REPO/". For Vercel/Netlify or a custom domain, leave it "/".
export default defineConfig({
  plugins: [react()],
  base: "/",
});
