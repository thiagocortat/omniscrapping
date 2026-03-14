export interface TechnologySignature {
  name: string;
  aliases?: string[];
  category: string;
  htmlPatterns?: RegExp[];
  strongHtmlPatterns?: RegExp[];
  scriptPatterns?: RegExp[];
  strongScriptPatterns?: RegExp[];
  headerPatterns?: Array<{ header: string; pattern: RegExp }>;
  cookiePatterns?: RegExp[];
}

export const TECHNOLOGY_SIGNATURES: TechnologySignature[] = [
  {
    name: "RD Station Marketing",
    aliases: ["RD Station", "RDStation", "RD Marketing"],
    category: "marketing automation",
    strongScriptPatterns: [
      /d335luupugsy2\.cloudfront\.net\/js\/loader-scripts\/[0-9a-f-]{36}-loader\.js/i,
      /d335luupugsy2\.cloudfront\.net\/js\/integration\/stable\/rd-js-integration(?:\.min)?\.js/i,
      /d335luupugsy2\.cloudfront\.net\/js\/forms\/stable\/rdstation-forms(?:\.min)?\.js/i
    ],
    scriptPatterns: [
      /d335luupugsy2\.cloudfront\.net\/js\//i,
      /rd-js-integration/i,
      /rdstation-(?:forms|min|init)\.js/i,
      /pageview-notify\.rdstation\.com\.br/i,
      /popups\.rdstation\.com\.br/i
    ],
    htmlPatterns: [
      /\bRdIntegration\b/i,
      /\bRDStationForms\b/i,
      /\bnew\s+RDStationForms\s*\(/i,
      /\bRdIntegration\.post\s*\(/i,
      /token_rdstation/i,
      /api\.rd\.services\/platform\/(?:conversions|events)/i,
      /pageview-notify\.rdstation\.com\.br/i,
      /popups\.rdstation\.com\.br/i,
      /"rdStation"\s*:\s*\{/i,
      /data-rdstation-form-id=/i,
      /data-rdstation-form-token=/i
    ],
    strongHtmlPatterns: [
      /"integrations"\s*:\s*\{\s*"rdStation"\s*:\s*\{\s*"token"\s*:\s*"[a-z0-9]{16,}"/i,
      /"rdStation"\s*:\s*\{\s*"token"\s*:\s*"[a-z0-9]{16,}"/i,
      /data-rdstation-form-id=["'][^"']+["'][^>]*data-rdstation-form-token=["'][^"']+["']/i
    ],
    cookiePatterns: [/\brdtrk\b/i, /\b_form_fields\b/i, /\b_rd(?:tk|st|trk|station)[^=]*=/i]
  },
  {
    name: "Google Tag Manager",
    category: "tag manager",
    htmlPatterns: [/googletagmanager\.com/i, /GTM-[A-Z0-9]+/i],
    scriptPatterns: [/googletagmanager\.com\/gtm\.js/i]
  },
  {
    name: "Meta Pixel",
    category: "pixel / ads",
    htmlPatterns: [/connect\.facebook\.net\/.*\/fbevents\.js/i, /fbq\s*\(/i],
    scriptPatterns: [/connect\.facebook\.net/i]
  },
  {
    name: "Hotjar",
    category: "analytics",
    htmlPatterns: [/static\.hotjar\.com/i, /hj\s*=\s*window\.hj/i],
    scriptPatterns: [/hotjar/i]
  },
  {
    name: "React",
    category: "framework frontend",
    htmlPatterns: [/__NEXT_DATA__/i, /data-reactroot/i, /react(-dom)?/i],
    scriptPatterns: [/react/i, /_next\/static/i]
  },
  {
    name: "Vue",
    category: "framework frontend",
    htmlPatterns: [/data-v-[a-f0-9]{6,}/i, /__VUE__/i],
    scriptPatterns: [/vue(\.runtime)?(\.min)?\.js/i]
  },
  {
    name: "Angular",
    category: "framework frontend",
    htmlPatterns: [/ng-version=/i, /<app-root/i],
    scriptPatterns: [/main\.[a-z0-9]+\.js/i]
  },
  {
    name: "Cloudflare",
    category: "CDN / WAF",
    headerPatterns: [
      { header: "server", pattern: /cloudflare/i },
      { header: "cf-ray", pattern: /.+/i }
    ],
    scriptPatterns: [/challenges\.cloudflare\.com/i]
  },
  {
    name: "WordPress",
    category: "CMS",
    htmlPatterns: [/wp-content/i, /meta\s+name=["']generator["'][^>]*wordpress/i],
    scriptPatterns: [/wp-includes/i]
  },
  {
    name: "Shopify",
    category: "CMS",
    htmlPatterns: [/cdn\.shopify\.com/i, /shopify-section/i],
    headerPatterns: [{ header: "x-shopid", pattern: /.+/i }]
  },
  {
    name: "Google Analytics",
    category: "analytics",
    scriptPatterns: [/googletagmanager\.com\/gtag\/js/i, /google-analytics\.com\/analytics\.js/i],
    htmlPatterns: [/gtag\s*\(/i]
  },
  {
    name: "HubSpot",
    category: "marketing automation",
    scriptPatterns: [/js\.hs-scripts\.com/i],
    cookiePatterns: [/hubspotutk/i]
  },
  {
    name: "Zendesk",
    category: "chat / suporte",
    scriptPatterns: [/static\.zendesk\.com/i],
    htmlPatterns: [/zE\(/i]
  }
];
