// Poster Pal site settings.
// Edit this file to change prices, checkout links and noticeboard spots. No other file needs to change.
window.POSTERPAL_CONFIG = {
  brand: "Poster Pal",
  campus: "DCU Glasnevin",
  currency: "€",
  maxSpots: 15,       // most spots one order can cover
  defaultSpots: 10,
  storeUrl: "",       // your Whop store page (optional)
  trackerUrl: "",     // public address of the scan tracker dashboard (see tracker/README.md); shows a link when set

  // checkoutUrl: paste the Whop checkout link for each product. While it is empty the button only copies the order code.
  packages: [
    { id: "post",   name: "Post",                  price: 10, tag: "You bring the posters",  blurb: "Hand us your printed posters and we put them up across campus within 24 hours.", checkoutUrl: "https://whop.com/checkout/plan_QREGn0w2qUeaP" },
    { id: "print",  name: "Print + Post",          price: 20, tag: "Most popular",           blurb: "Send the file. We print up to 15 copies and put them up within 24 hours.",       checkoutUrl: "https://whop.com/checkout/plan_utfDtaOt0q90M" },
    { id: "design", name: "Design + Print + Post", price: 30, tag: "Just send the details",  blurb: "Tell us about your event. We design the poster, print it and put it up.",         checkoutUrl: "https://whop.com/checkout/plan_cK9ZKqGxAMqr3" }
  ],

  map: { center: [53.38535, -6.25729], zoom: 16, bounds: [[53.3832, -6.2616], [53.3875, -6.2530]] },

  // One entry per building with a noticeboard. Remove buildings that have no board and add any that are missing.
  // zone: study | social | teaching | living | sport | venue | admin
  // audiences: all, computing, engineering, science, health, business, humanities, residents
  // footfall: 1 (quiet) to 5 (busiest). Coordinates come from OpenStreetMap.
  spots: [
    { id: "LIB",  name: "O'Reilly Library",          lat: 53.384203, lon: -6.254576, zone: "study",    audiences: ["all"],                                footfall: 5 },
    { id: "U",    name: "The U (Student Centre)",    lat: 53.385160, lon: -6.258570, zone: "social",   audiences: ["all"],                                footfall: 5 },
    { id: "HG",   name: "Henry Grattan Building",    lat: 53.386073, lon: -6.259648, zone: "teaching", audiences: ["all", "humanities"],                  footfall: 5 },
    { id: "REST", name: "Main Restaurant",           lat: 53.385743, lon: -6.260882, zone: "social",   audiences: ["all"],                                footfall: 4 },
    { id: "BS",   name: "DCU Business School",       lat: 53.386226, lon: -6.257471, zone: "teaching", audiences: ["business"],                           footfall: 4 },
    { id: "MCN",  name: "McNulty Building",          lat: 53.385723, lon: -6.257686, zone: "teaching", audiences: ["computing"],                          footfall: 4 },
    { id: "STK",  name: "Stokes Building",           lat: 53.385560, lon: -6.256105, zone: "teaching", audiences: ["engineering"],                        footfall: 4 },
    { id: "SPT",  name: "DCU Sports Complex",        lat: 53.384645, lon: -6.257941, zone: "sport",    audiences: ["all"],                                footfall: 4 },
    { id: "MAR",  name: "Marconi Building",          lat: 53.385194, lon: -6.256230, zone: "teaching", audiences: ["science", "engineering"],             footfall: 3 },
    { id: "LON",  name: "Lonsdale Building",         lat: 53.384965, lon: -6.254905, zone: "teaching", audiences: ["science"],                            footfall: 3 },
    { id: "POL",  name: "Polaris Building",          lat: 53.386304, lon: -6.256029, zone: "teaching", audiences: ["computing", "engineering", "science"], footfall: 3 },
    { id: "ARB",  name: "Alice Reeves Building",     lat: 53.385821, lon: -6.254700, zone: "teaching", audiences: ["health"],                             footfall: 3 },
    { id: "HAM",  name: "Hamilton Building",         lat: 53.385388, lon: -6.259597, zone: "teaching", audiences: ["all"],                                footfall: 3 },
    { id: "TLT",  name: "Terence Larkin Theatre",    lat: 53.386207, lon: -6.258176, zone: "venue",    audiences: ["all"],                                footfall: 3 },
    { id: "NUB",  name: "Nubar",                     lat: 53.385070, lon: -6.258921, zone: "social",   audiences: ["all"],                                footfall: 3 },
    { id: "CPR",  name: "College Park Residences",   lat: 53.383590, lon: -6.258455, zone: "living",   audiences: ["residents"],                          footfall: 3 },
    { id: "LAR",  name: "Larkfield Residences",      lat: 53.384540, lon: -6.257017, zone: "living",   audiences: ["residents"],                          footfall: 3 },
    { id: "HMP",  name: "Hampstead Residences",      lat: 53.383963, lon: -6.257616, zone: "living",   audiences: ["residents"],                          footfall: 3 },
    { id: "MAC",  name: "Mac Cormac Building",       lat: 53.385941, lon: -6.256845, zone: "teaching", audiences: ["all"],                                footfall: 2 },
    { id: "BEA",  name: "Bea Orpen Building",        lat: 53.385090, lon: -6.259946, zone: "teaching", audiences: ["all"],                                footfall: 2 },
    { id: "ALB",  name: "Albert College",            lat: 53.385474, lon: -6.260640, zone: "admin",    audiences: ["all"],                                footfall: 2 },
    { id: "HLX",  name: "The Helix",                 lat: 53.386456, lon: -6.259280, zone: "venue",    audiences: ["all"],                                footfall: 2 },
    { id: "PGR",  name: "Postgraduate Residences",   lat: 53.385074, lon: -6.259502, zone: "living",   audiences: ["residents"],                          footfall: 2 },
    { id: "IFC",  name: "Inter Faith Centre",        lat: 53.385514, lon: -6.258939, zone: "social",   audiences: ["all"],                                footfall: 1 },
    { id: "INV",  name: "Invent",                    lat: 53.384711, lon: -6.253479, zone: "admin",    audiences: ["business"],                           footfall: 1 }
  ]
};
