import { hexToRgb } from './helpers';

/**
 * Applies the tenant's primary color to the entire application by overriding CSS variables.
 * @param {string} primaryColor - Hex color code (e.g., #f97316)
 */
export function applyTheme(primaryColor) {
  // Always enforce the premium professional black-and-white palette
  let styleTag = document.getElementById('dynamic-branding-style');
  if (!styleTag) {
    styleTag = document.createElement('style');
    styleTag.id = 'dynamic-branding-style';
    document.head.appendChild(styleTag);
  }

  styleTag.innerHTML = `
    :root {
      --primary-50: 248, 250, 252 !important;
      --primary-100: 241, 245, 249 !important;
      --primary-200: 226, 232, 240 !important;
      --primary-300: 203, 213, 225 !important;
      --primary-400: 148, 163, 184 !important;
      --primary-50: 248, 250, 252 !important;
      --primary-500: 0, 0, 0 !important;
      --primary-600: 15, 23, 42 !important;
      --primary-700: 30, 41, 59 !important;
      --primary-800: 15, 23, 42 !important;
      --primary-900: 2, 6, 23 !important;
    }
  `;

  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  const values = {
    50: "248, 250, 252",
    100: "241, 245, 249",
    200: "226, 232, 240",
    300: "203, 213, 225",
    400: "148, 163, 184",
    500: "0, 0, 0",
    600: "15, 23, 42",
    700: "30, 41, 59",
    800: "15, 23, 42",
    900: "2, 6, 23"
  };
  shades.forEach(shade => {
    document.documentElement.style.setProperty(`--primary-${shade}`, values[shade]);
  });
}

/**
 * Removes all dynamic branding styles and returns the application to default colors.
 */
export function clearTheme() {
  // Remove the high-priority style tag
  const styleTag = document.getElementById('dynamic-branding-style');
  if (styleTag) {
    styleTag.remove();
  }
  
  // Clear the inline properties from document element
  const shades = [50, 100, 200, 300, 400, 500, 600, 700, 800, 900];
  shades.forEach(shade => {
    document.documentElement.style.removeProperty(`--primary-${shade}`);
  });
}
