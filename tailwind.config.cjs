module.exports = {
  content: [
    './src/**/*.{astro,html,js,ts,jsx,tsx}',
    // Scan the shared @cms packages so classes used only in shared components
    // (e.g. the account page's lg:col-span-2 grid) get generated.
    './shared/packages/**/*.{astro,html,js,ts,jsx,tsx}',
  ],
  theme: {
    container: {
      center: true,
      padding: '1.5rem',
      screens: {
        sm:   '640px',
        md:   '768px',
        lg:   '1024px',
        xl:   '1400px',
        '2xl':'1600px',
      },
    },
    extend: {
      fontFamily: {
        'sans': ['Source Sans Pro', 'system-ui', '-apple-system', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
