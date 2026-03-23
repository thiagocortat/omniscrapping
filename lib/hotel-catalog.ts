export interface HotelSignature {
  name: string;
  category: "technology" | "ads" | "crm" | "booking-engine";
  patterns: RegExp[];
  aliasPatterns?: RegExp[];
}

function domainPattern(value: string): RegExp {
  return new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
}

export const HOTEL_SIGNATURES: HotelSignature[] = [
  {
    name: "Google Tag Manager",
    category: "ads",
    patterns: [domainPattern("googletagmanager.com"), /\bGTM-[A-Z0-9]+\b/i]
  },
  {
    name: "Google Ads",
    category: "ads",
    patterns: [
      domainPattern("googleadservices.com"),
      domainPattern("googlesyndication.com"),
      /\bgtag\s*\(\s*["']config["']\s*,\s*["']AW-/i
    ]
  },
  {
    name: "Meta Pixel",
    category: "ads",
    patterns: [domainPattern("connect.facebook.net"), /\bfbq\s*\(/i]
  },
  {
    name: "TikTok Pixel",
    category: "ads",
    patterns: [domainPattern("analytics.tiktok.com"), /\bttq\s*\./i]
  },
  {
    name: "LinkedIn Insight Tag",
    category: "ads",
    patterns: [domainPattern("snap.licdn.com"), /\b_linkedin_partner_id\b/i]
  },
  {
    name: "Google Analytics",
    category: "ads",
    patterns: [domainPattern("google-analytics.com"), /G-[A-Z0-9]{6,}/i]
  },
  {
    name: "Hotjar",
    category: "ads",
    patterns: [domainPattern("hotjar.com"), /\bhj\s*=\s*window\.hj\b/i]
  },
  {
    name: "HubSpot",
    category: "crm",
    patterns: [domainPattern("js.hs-scripts.com"), /\bhubspotutk\b/i]
  },
  {
    name: "RD Station Marketing",
    category: "crm",
    patterns: [
      domainPattern("rdstation.com.br"),
      domainPattern("rd.services"),
      domainPattern("d335luupugsy2.cloudfront.net"),
      /\bRDStationForms\b/i,
      /\bRdIntegration\b/i
    ]
  },
  {
    name: "Salesforce",
    category: "crm",
    patterns: [domainPattern("salesforce.com"), /pardot/i]
  },
  {
    name: "Zoho CRM",
    category: "crm",
    patterns: [domainPattern("zohopublic.com"), domainPattern("zoho.com")]
  },
  {
    name: "React / Next.js",
    category: "technology",
    patterns: [/\b__NEXT_DATA__\b/i, /_next\/static/i, /\breact(-dom)?\b/i]
  },
  {
    name: "WordPress",
    category: "technology",
    patterns: [/wp-content/i, /wp-includes/i, /wordpress/i]
  },
  {
    name: "Cloudflare",
    category: "technology",
    patterns: [/cloudflare/i, /\bcf-ray\b/i]
  },
  {
    name: "Cloudbeds",
    category: "booking-engine",
    patterns: [
      domainPattern("cloudbeds.com"),
      domainPattern("mybookingsite.io"),
      domainPattern("hotels.cloudbeds.com"),
      domainPattern("app.cloudbeds.com")
    ],
    aliasPatterns: [/cloudbeds-booking-button/i, /mybookingsite/i]
  },
  {
    name: "Omnibees",
    category: "booking-engine",
    patterns: [
      domainPattern("omnibees.com"),
      domainPattern("book.omnibees.com"),
      domainPattern("reservas.omnibees.com"),
      domainPattern("secure.omnibees.com"),
      /bookings?\.omnibees/i
    ],
    aliasPatterns: [/hotelresults/i, /omni[-_ ]?bees/i, /booking[-_ ]?engine/i]
  },
  {
    name: "Niara",
    category: "booking-engine",
    patterns: [
      domainPattern("niara.com"),
      domainPattern("reservas.niara"),
      domainPattern("booking.niara"),
      domainPattern("motor.niara"),
      /\bniara\b/i
    ],
    aliasPatterns: [/motor[-_ ]?de[-_ ]?reservas/i, /niara[-_ ]?booking/i]
  },
  {
    name: "Letsbook",
    category: "booking-engine",
    patterns: [
      domainPattern("letsbook.com.br"),
      domainPattern("reservas.letsbook"),
      domainPattern("booking.letsbook"),
      domainPattern("motor.letsbook")
    ],
    aliasPatterns: [/letsbook[-_ ]?booking/i, /lb[-_ ]?booking/i]
  },
  {
    name: "SynXis",
    category: "booking-engine",
    patterns: [
      domainPattern("synxis.com"),
      domainPattern("be.synxis.com"),
      domainPattern("bookings.synxis.com"),
      domainPattern("secure.synxis.com")
    ],
    aliasPatterns: [/synxis[-_ ]?booking/i, /\bibe\b/i]
  },
  {
    name: "D-EDGE",
    category: "booking-engine",
    patterns: [
      domainPattern("d-edge.com"),
      domainPattern("book.secure-hotel-booking.com"),
      domainPattern("reservations.d-edge.com"),
      domainPattern("secure-hotel-booking.com"),
      domainPattern("wiihotel.com")
    ],
    aliasPatterns: [/wiihotel/i, /secure[-_ ]?hotel[-_ ]?booking/i]
  },
  {
    name: "Bookassist",
    category: "booking-engine",
    patterns: [
      domainPattern("bookassist.com"),
      domainPattern("bookassist.org"),
      domainPattern("bookassist.net"),
      domainPattern("booking.bookassist")
    ],
    aliasPatterns: [/bookassist[-_ ]?engine/i]
  },
  {
    name: "Paratytech",
    category: "booking-engine",
    patterns: [
      domainPattern("paratytech.com"),
      domainPattern("booking.paratytech.com"),
      domainPattern("reservas.paratytech.com")
    ],
    aliasPatterns: [/paraty[-_ ]?tech/i, /pt[-_ ]?booking/i]
  },
  {
    name: "Mirai",
    category: "booking-engine",
    patterns: [
      domainPattern("mirai.com"),
      domainPattern("reserve-online.net"),
      domainPattern("reservas.mirai.com"),
      domainPattern("booking.mirai.com")
    ],
    aliasPatterns: [/mirai[-_ ]?booking/i, /reserve[-_ ]?online/i]
  },
  {
    name: "Avvio",
    category: "booking-engine",
    patterns: [
      domainPattern("avvio.com"),
      domainPattern("bookings.avvio.com"),
      domainPattern("booking.avvio.com")
    ],
    aliasPatterns: [/avvio[-_ ]?booking/i]
  },
  {
    name: "iHotelier",
    category: "booking-engine",
    patterns: [
      domainPattern("ihotelier.com"),
      domainPattern("bookings.ihotelier.com"),
      domainPattern("reservations.ihotelier.com"),
      domainPattern("travelclick.com")
    ],
    aliasPatterns: [/travelclick/i, /ihotelier[-_ ]?booking/i]
  },
  {
    name: "SiteMinder",
    category: "booking-engine",
    patterns: [
      domainPattern("siteminder.com"),
      domainPattern("thebookingbutton.com"),
      domainPattern("book.direct"),
      domainPattern("bookingbutton.com")
    ],
    aliasPatterns: [/the[-_ ]?booking[-_ ]?button/i, /book\.direct/i]
  },
  {
    name: "Net Affinity",
    category: "booking-engine",
    patterns: [
      domainPattern("netaffinity.io"),
      domainPattern("bookings.netaffinity.io"),
      domainPattern("reserve.netaffinity.io")
    ],
    aliasPatterns: [/netaffinity/i]
  },
  {
    name: "Desbravador",
    category: "booking-engine",
    patterns: [
      domainPattern("desbravador.com.br"),
      domainPattern("reservas.desbravador.com.br"),
      domainPattern("book.desbravador.com.br")
    ],
    aliasPatterns: [/desbravador[-_ ]?reservas/i]
  },
  {
    name: "FastBooking",
    category: "booking-engine",
    patterns: [
      domainPattern("fastbooking.travel"),
      domainPattern("reservations.fastbooking.travel"),
      domainPattern("book.fastbooking.travel")
    ],
    aliasPatterns: [/fastbooking/i]
  },
  {
    name: "HotelDO",
    category: "booking-engine",
    patterns: [
      domainPattern("hoteldo.com"),
      domainPattern("reservas.hoteldo.com"),
      domainPattern("booking.hoteldo.com")
    ],
    aliasPatterns: [/hoteldo[-_ ]?booking/i]
  },
  {
    name: "Simplotel",
    category: "booking-engine",
    patterns: [
      domainPattern("simplotel.com"),
      domainPattern("bookings.simplotel.com"),
      domainPattern("reservation.simplotel.com")
    ],
    aliasPatterns: [/simplotel/i]
  },
  {
    name: "eZee Reservation",
    category: "booking-engine",
    patterns: [
      domainPattern("ezeereservation.com"),
      domainPattern("live.ipms247.com"),
      domainPattern("bookings.ezeereservation.com")
    ],
    aliasPatterns: [/ipms247/i, /ezee[-_ ]?reservation/i]
  },
  {
    name: "GuestCentric",
    category: "booking-engine",
    patterns: [
      domainPattern("guestcentric.net"),
      domainPattern("guestcentric.com"),
      domainPattern("bookings.guestcentric.net")
    ],
    aliasPatterns: [/guestcentric/i]
  },
  {
    name: "WebHotelier",
    category: "booking-engine",
    patterns: [
      domainPattern("webhotelier.net"),
      domainPattern("book.webhotelier.net"),
      domainPattern("secure.webhotelier.net")
    ],
    aliasPatterns: [/webhotelier/i]
  },
  {
    name: "ReservHotel",
    category: "booking-engine",
    patterns: [
      domainPattern("reservhotel.com"),
      domainPattern("book.reservhotel.com"),
      domainPattern("secure.reservhotel.com")
    ],
    aliasPatterns: [/reservhotel/i]
  }
];

export const RESERVE_KEYWORDS = [
  "reservar",
  "reserva",
  "reserva aqui",
  "reservas",
  "reservar agora",
  "haz tu reserva",
  "hacer reserva",
  "reserva online",
  "book direct",
  "reserve",
  "reserve online",
  "online booking",
  "book online",
  "book",
  "booking",
  "check availability",
  "ver disponibilidade",
  "ver tarifas",
  "consultar disponibilidad",
  "ver disponibilidad",
  "comprueba disponibilidad",
  "availability",
  "book now",
  "reserve now",
  "check rates",
  "see rates"
];

export const BOOKING_SUBMIT_KEYWORDS = [
  "buscar",
  "pesquisar",
  "disponibilidade",
  "consultar disponibilidad",
  "disponibilidad",
  "availability",
  "search",
  "find rooms",
  "book now",
  "reservar",
  "ver tarifas",
  "check rates",
  "ver disponibilidad",
  "continuar",
  "continuar reserva"
];

export const RESERVE_NEGATIVE_KEYWORDS = [
  "politica",
  "política",
  "termos",
  "condicoes",
  "condições",
  "regras",
  "cancelamento",
  "cancellation",
  "cancelacion",
  "cancelación",
  "privacy",
  "privacidade",
  "faq",
  "duvidas",
  "dúvidas",
  "informacoes",
  "informações",
  "saiba mais",
  "learn more",
  "more info",
  "regulamento"
];
