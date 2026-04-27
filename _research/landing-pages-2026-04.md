# Angel & Syndicate Landing Page Analysis

_53 organizations from `org-data.js` (34 Angels, 19 Syndicates), fetched and analyzed 2026-04-27._

Method: each homepage fetched directly, parsed for title, meta description, H1/H2/H3 headings, navigation, action links, lead paragraph, and tech-stack signals. 49 of 53 returned content; 4 failed to fetch (see Data Quality section below).

---

## Data quality issues (urgent: these affect the live landscape map)

13 of 53 listings are broken, parked, or pointing at the wrong organization. The map currently sends users to dead pages or unrelated sites.

| Org | URL in `org-data.js` | What you actually get |
|---|---|---|
| Iowa AgriTech Accelerator | agritechaccelerator.com | DNS does not resolve |
| SeaChange Fund | seachange.fund | DNS does not resolve |
| NO/LA Angel Network | nolaangelnetwork.org | DreamHost "Site not found" placeholder |
| Falls Angel Fund | fallsangelfund.com | DreamHost "Site not found" placeholder |
| Hatch Innovation | hatchthefuture.org | Domain is for sale |
| InvestinKin | investinkin.com | Domain for sale on HugeDomains ($2,995) |
| Coralus (formerly SheEO) | coralus.world | Live, but copy says "we aren't welcoming new members right now"; org is in "RESET" |
| Ascending Angels (VA) | ascendingangelsinc.org | **Wrong organization.** This is a funeral/memorial nonprofit, not an angel syndicate |
| Wyoming Angel Network | wyomingbusiness.org | Wyoming Business Council homepage; angel network is not surfaced |
| Broad Street Angels | unionleague.org | Union League of Philadelphia (a private city club); angel group is not on the homepage |
| Gaingels | gaingels.com | 403 bot-blocked, but the site exists; needs a deeper link or a research note |
| BlueTree Allied Angels | bluetreealliedangels.com | 401, member-gated; no public landing page |
| X Squared Angels | xsquaredangels.com | Empty `<title>`, no visible content; likely broken |

**Plus 3 duplicates pointing at goldenseeds.com:** the AZ, Philly, and Chicago chapters all share the national URL. Either link to chapter sub-pages or note the rollup in the data.

**Plus 1 duplicate domain:** ATL TrailblazHER Angels and "Women on the Cap Table" both point to atltrailblazherangels.com. May be the same org under two names.

---

## The four homepage archetypes

Across the 40 working pages, four patterns dominate.

### 1. The two-door homepage (most common, ~22 sites)
Hero splits into "For Founders" and "For Investors / Members" with equal billing.

Examples: Golden Seeds, Ark Angel Alliance, Tidal River Fund, TCA Venture Group, Launchpad, Maine Angels, Citrine Angels, NY Angels, Frontier Angels, Nebraska Angels, JumpFund, BEAM, Belle Capital.

Typical sections: Mission, Investment Criteria, Portfolio, Apply for Funding, Become a Member, Events, News.

### 2. The investor-only club (~6 sites)
Founders application is hidden or absent. Page is pitched at prospective members.

Examples: Brydge Club ("Apply to join our next cohort"), The Beam Network (private financial education for high-net-worth women), Plum Alley Ventures, Impact Invest Her, Broadway Angels (sparse, members-only feel), OSEA.

### 3. The platform / multi-product homepage (~5 sites)
Less an angel network, more a content + tools + community brand.

Examples: Hustle Fund / Angel Squad (newsletters, event series, books, pitch deck product, scrappy voice), The Helm (fund + syndicate + media: "The Helm Review"), iFundWomen (now "IFW by Honeycomb Credit", pivoted to small business loans/crowdfunding), She Angel Investors (film + podcast + book + speaker), Coralus (community in transition).

### 4. The personal / portfolio site (2 sites)
Lower-key, individual-investor presence.

Examples: Gotham Gal Ventures (Joanne Wilson's blog with portfolio links), The Council Angels (operator-led, founder-focused, very small footprint).

---

## Common patterns across the field

**Nav (typical 4 to 6 items):** About, Portfolio, Apply for Funding, Become a Member, Events, Contact. Maine Angels, NY Angels, Citrine, and Golden Seeds are the cleanest executions.

**Top CTAs (frequency):**
- "Apply for Funding" / "Apply for Investment" on 26+ sites
- "Become a Member" / "Membership" on 24+ sites
- "Contact Us" universal
- "Subscribe" / "Newsletter sign-up" on ~15 sites
- "Member Login" on ~12 sites (gated portals are common)

**Investment thesis copy (when present):** typically 2 to 3 lines. Stage (pre-seed / seed / Series A), check size ($25K to $500K range), sector (sometimes specific, often "agnostic"), geography. **Most sites do not publish member dues or LP minimums on the homepage.**

**Tech stack:**
- Squarespace ~10 (Brydge, Maine Angels, Citrine, Council, Trailblazher, Plum Alley peers)
- WordPress ~12 (Golden Seeds, Astia, Frontier, BGV, Beam-adjacent)
- Wix ~5 (Startup Ladies, JumpFund, BEAM, Astia, 360 Venture)
- Webflow only 2 (Hustle Fund, Plum Alley); both feel modern
- Most sites are visibly aging: small images, dated typography, weak mobile.

**Trust signals (on most polished sites):** founding year ("over 20 years," "since 2003"), portfolio company logos, member counts ("100+ angels," "400 members"), press / partner logos, dollar totals invested.

---

## Standouts worth studying for `join.html`

| Site | Why it is worth a look |
|---|---|
| Golden Seeds | Cleanest two-door split. Two adjacent panels: "For Entrepreneurs Seeking Funding" and "For Prospective Members," each with sub-nav (Funding Criteria, How to Apply / Why Join, Member Benefits, Events). Best in class for clarity. |
| Brydge Club | Tightest investor-only pitch in the set. "We get women on cap tables." Cohort-based application is novel and scarcity-driven. Closest model to what Silver & Salt Capital is building. |
| Hustle Fund / Angel Squad | Voice and content depth. Newsletters, books, events, pitch deck product, blog. Aggressive but distinctive ("pooping hippo rainbows" sub-headline). High volume of free resources as funnel. |
| The Helm | Combines fund + syndicate + editorial brand. Single CTA ladder: Apply for funding (founders) / Become an LP (investors). The "Helm Review" media arm is a smart trust-builder. |
| Frontier Angels | Strong regional angle ("Montana-based, professionally managed"). Explicit "WE DO NOT INVEST IN" section is unusual and useful: it saves both sides time. |
| Tidal River Fund | Crisp tagline ("women investors making waves"), small fund ($1M) that is honest about scale, applies to "anywhere in the U.S." despite the CT name. |

---

## Notable gaps across the field

These are conventions almost nobody is doing, which means real differentiation opportunities for Silver & Salt Capital's `join.html`.

1. **Cost transparency.** Almost no site publishes membership dues, LP minimums, or per-deal commitments on the homepage. Most require email-then-phone-call to get numbers. Your `landscape-map.html` cost data is genuinely rare.
2. **Calendar booking on the apply path.** Only a few use Calendly inline. Most use long forms or email-only. Your two-step (form, then calendar) is unusual and modern.
3. **Editorial / research output.** Aside from The Helm, Hustle Fund, and StartOut, very few have published content. Your Open Research series is a real differentiator.
4. **Plain-language voice.** Most sites read corporate, legal, or dated. The few warm voices (Brydge, Hustle Fund, JumpFund) stand out immediately. Your join page voice is closer to Brydge.
5. **Mobile.** Many sites visibly had not been touched for mobile in years (Wix-era, dated WordPress themes). Your recent mobile fixes put you ahead.
6. **Visible LP economics.** No one shows the GP / LP fee structure on the homepage. Industry-standard 2/20 is assumed but never stated.

---
---

# Per-site profiles

Each profile below is the raw machine-extracted summary of the homepage: title tag, meta description, headings, navigation, action links, lead paragraph, and tech-stack signals. Keep this as the source of truth for any future redesign benchmarking.


## Angels (34)

### Golden Seeds (AZ) (Angel · Arizona)
URL: https://goldenseeds.com  →  https://www.goldenseeds.com/
- **Title tag**: Home | Golden Seeds
- **Meta description**: Golden Seeds is a leading angel investment network funding women-led startups for over 20 years while building a nationwide community of experienced investors.
- **H1**: Fueling Women-Led Innovation for Over 20 Years
- **H2 sections**: For Entrepreneurs Seeking Funding | For Prospective Members | From a Bold Idea to a National Movement | Latest News, Bold Thinking and Real Impact | Our Priorities | Women-Led Focus
- **Nav**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · Explore Your Fit - Info Sessions & Offic · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members
- **CTAs/action links**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members · Investor Training through the Knowledge Institute
- **Lead paragraph**: We invest in exceptional women-led startups - and build community among investors who recognize the potential of these companies.
- **Signals**: LinkedIn link, Twitter/X, Founder apply path, Member language

### Ark Angel Alliance (Angel · Arkansas)
URL: https://arkangelalliance.org
- **Title tag**: Ark Angel Alliance
- **H1**: Supporting Investments & Investors
- **H2 sections**: Our Mission | Looking to Invest? | Need Investment? | Sign Up For Our Newsletter | Sponsors
- **Nav**: Investors · Entrepreneurs · FAQs · Sponsors · About · Events · Contact
- **CTAs/action links**: Investors · About · Contact · Apply for Membership · Apply for Funding · Sign Up · About Intro · Join
- **Lead paragraph**: We’re a group of investors, business leaders and community leaders committed to growing the Arkansas economy by capitalizing the most promising startup companies in our region and throughout the state.
- **Signals**: LinkedIn link, Squarespace, Google Form, Portfolio/case studies, Founder apply path, Member language

### Broadway Angels (Angel · California)
URL: https://www.broadway-angels.com  →  https://broadwayangels.org/
- **Title tag**: Broadway Angels
- **H1**: 
- **Nav**: Home · About · Members
- **CTAs/action links**: About · Members
- **Signals**: LinkedIn link, Twitter/X, Squarespace, Founder apply path, Member language

### OSEA Angel Investors (Angel · California)
URL: https://www.oseaangelinvestors.com
- **Title tag**: OSEA
- **Meta description**: Osea Angel Investors is a membership-based private angel investment group focused on and driven by women executives and entrepreneurs with very diverse and successful backgrounds
- **H2 sections**:  | OUR PARTNERS AND SPONSORS |  | Connection | Education | Inspiration
- **CTAs/action links**: Portfolio · About · Contact · ​ Member Login · Become a Member · Investors
- **Lead paragraph**: We inspire women to learn more about the angel investing world by offering education and access to early stage companies looking for investors.
- **Signals**: LinkedIn link, Twitter/X, WordPress, Portfolio/case studies, Founder apply path, Member language

### TCA Venture Group (Angel · California)
URL: https://tcaventuregroup.com
- **Title tag**: TCA Venture Group - TCA Venture Group
- **Meta description**: Helping Startup Founders Achieve Their Dreams
- **H2 sections**: Who We Are | What We Bring | What We’ve Done
- **CTAs/action links**: Apply for Funding · About Us · Portfolio · TCA Portfolio · Portfolio Statistics · Apply Now! · Join Now! · Apply for Membership
- **Lead paragraph**: TCA Venture Group (TCA), formerly known as Tech Coast Angels, is headquartered in Southern California, plays a pivotal role in fueling the growth of the startup ecosystem. With approximately 400 members and five angel funds, TCA has the res
- **Signals**: LinkedIn link, Instagram, Twitter/X, WordPress, Mailchimp, Portfolio/case studies, Founder apply path, Member language

### Tidal River Fund (Angel · Connecticut)
URL: https://www.tidalriverct.com
- **Title tag**: Tidal River - Accredited women investors making waves in Connecticut
- **Meta description**: We help Connecticut’s boldest visionaries grow their companies.Welcome to Tidal River. An angel investor network for women.
- **H1**: Women investors making waves in the entrepreneurial ecosystem.
- **H2 sections**: How We Started | What We Do | Why We're Here | MEET OUR TEAM | BECOME AN INVESTOR | Investment Criteria
- **Nav**: Mission · Team · Funding · Portfolio · Resource Center · Network · Contact
- **CTAs/action links**: Funding · Portfolio · Contact · For Investors · Apply · BECOME AN INVESTOR · APPLY FOR FUNDING · Contact Us
- **Lead paragraph**: A $1M women-led fund supporting disruptive and scalable early-stage companies that champion diversity and equity. The fund comprises women investors looking to empower bold visionaries across all industries , anywhere in the U.S. We are Tid
- **Signals**: LinkedIn link, WordPress, Portfolio/case studies, Founder apply path, Member language

### ATL TrailblazHER Angels (Angel · Georgia)
URL: https://atltrailblazherangels.com
- **Title tag**: Home - ATL TrailblazHER Angels
- **Meta description**: ATL TrailblazHER Angels is a women-led angel group with a mission to fuel innovation and expand Atlanta’s angel ecosystem.
- **H1**: Supporting High-Potential Founders
- **H2 sections**: Ready to help us blaze the trail? | Want to learn more about ATL TrailblazHER Angels? | Stay Up to Date with The ATL TrailblazHER Angels
- **Nav**: About · Founder · Membership · Partner
- **CTAs/action links**: About · Membership · Learn More · Sign Up
- **Lead paragraph**: ATL TrailblazHER Angels is a women-led angel group with a mission to fuel innovation and expand Atlanta’s angel ecosystem.
- **Signals**: LinkedIn link, Instagram, WordPress, Squarespace, Calendly, Portfolio/case studies, Founder apply path, Member language

### Women on the Cap Table (Angel · Georgia)
URL: https://atltrailblazherangels.com
- **Title tag**: Home - ATL TrailblazHER Angels
- **Meta description**: ATL TrailblazHER Angels is a women-led angel group with a mission to fuel innovation and expand Atlanta’s angel ecosystem.
- **H1**: Supporting High-Potential Founders
- **H2 sections**: Ready to help us blaze the trail? | Want to learn more about ATL TrailblazHER Angels? | Stay Up to Date with The ATL TrailblazHER Angels
- **Nav**: About · Founder · Membership · Partner
- **CTAs/action links**: About · Membership · Learn More · Sign Up
- **Lead paragraph**: ATL TrailblazHER Angels is a women-led angel group with a mission to fuel innovation and expand Atlanta’s angel ecosystem.
- **Signals**: LinkedIn link, Instagram, WordPress, Squarespace, Calendly, Portfolio/case studies, Founder apply path, Member language

### Golden Seeds (Chicago) (Angel · Illinois)
URL: https://goldenseeds.com  →  https://www.goldenseeds.com/
- **Title tag**: Home | Golden Seeds
- **Meta description**: Golden Seeds is a leading angel investment network funding women-led startups for over 20 years while building a nationwide community of experienced investors.
- **H1**: Fueling Women-Led Innovation for Over 20 Years
- **H2 sections**: For Entrepreneurs Seeking Funding | For Prospective Members | From a Bold Idea to a National Movement | Latest News, Bold Thinking and Real Impact | Our Priorities | Women-Led Focus
- **Nav**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · Explore Your Fit - Info Sessions & Offic · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members
- **CTAs/action links**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members · Investor Training through the Knowledge Institute
- **Lead paragraph**: We invest in exceptional women-led startups - and build community among investors who recognize the potential of these companies.
- **Signals**: LinkedIn link, Twitter/X, Founder apply path, Member language

### The Startup Ladies (Angel · Indiana)
URL: https://www.thestartupladies.org
- **Title tag**: Startup Education | TheStartupLadies.org
- **Meta description**: The Startup Ladies is a membership organization that provides support, education, and investment opportunities for women entrepreneurs starting up and scaling businesses. All genders welcome!
- **H2 sections**: Our Mission = Your Growth | Executives | Investors | Entrepreneurs | Education for Founders + Funders | Community + Connection
- **Nav**: About Us · eLearning · Project Boardup · Shop · Staff & Board · The Startup Ladies Fund · Educational & Social Programs · Events Calendar
- **CTAs/action links**: About Us · The Startup Ladies Fund · 2025 #InvestInWomenFounders Summit · Investors · How Your First Startup Investment Works: A Guide for First-T · >>> Investors · >>> Fund a Startup Lady · >>> Apply NOW!
- **Signals**: LinkedIn link, Instagram, Twitter/X, Wix, Founder apply path, Member language

### Iowa AgriTech Accelerator (Angel · Iowa)
URL: https://www.agritechaccelerator.com
- **STATUS**: FETCH ERROR — URLError: <urlopen error [Errno 8] nodename nor servname provided, or not known>

### NO/LA Angel Network (Angel · Louisiana)
URL: https://nolaangelnetwork.org
- **Title tag**: Site not found · DreamHost
- **Meta description**: The owner of this domain has not yet uploaded their website.
- **H1**: Site Not Found
- **CTAs/action links**: contact support
- **Lead paragraph**: Well, this is awkward. The site you're looking for is not here.

### Maine Angels (Angel · Maine)
URL: https://maineangels.org  →  https://www.maineangels.org/
- **Title tag**: Maine Angels
- **Meta description**: Maine Angels Investing In Innovative Start Ups
- **H1**:  | Maine Angels have invested over $44 million since our founding in 2003.
- **H2 sections**: We make investments in promising New England entrepreneurs with an emphasis on Maine businesses. | Maine Angels helps entrepreneurs by investing in and mentoring early stage companies.
- **H3 sections**: Click here for an up to date list of events In the Maine startup ecosystem
- **Nav**: Home · About Us · Employment · Portfolio Companies · Investment Summary · Become a Member · Sign up for Dealum · Dirigo Angel Fund III
- **CTAs/action links**: About Us · Portfolio Companies · Investment Summary · Become a Member · Sign up for Dealum · Contact Us · Application Information · Application Deadlines and Presentation Dates
- **Lead paragraph**: Maine Angels has invested in more than 100 companies since inception in 2003. Most of the companies are located in Maine and the surrounding states.
- **Signals**: LinkedIn link, Squarespace, Portfolio/case studies, Founder apply path, Member language

### Citrine Angels (Angel · Maryland)
URL: https://www.citrineangels.com
- **Title tag**: Citrine Angels | Angel Investing for Women by Women
- **Meta description**: Citrine Angels is an angel investing group for women by women. Based in Washington, DC, the Citrine Angels provides early stage investment opportun...
- **H1**: Our Mission | What We Do | 
- **H2 sections**: Citrine Angels provides early-stage investment opportunities and education to female investors interested in supporting female-founded startups | Executive Committee | Stay In Touch | ©2024 All Rights Reserved |Terms of Service
- **Nav**: Home (current) · Engage · Invest · Apply · Sponsor · Support · Upcoming Events · Portfolio Companies
- **CTAs/action links**: Invest · Apply · Portfolio Companies · About Us · Member Login · Become a Member · Apply for Investment · For Investors
- **Lead paragraph**: We support the growth and success of female-founded businesses and increase access to investment opportunities for women
- **Signals**: LinkedIn link, Instagram, Portfolio/case studies, Founder apply path, Member language

### Launchpad Venture Group (Angel · Massachusetts)
URL: https://www.launchpadventuregroup.com
- **Title tag**: Launchpad Venture Group
- **H1**: FINANCIAL & HUMAN CAPITAL INVESTMENT IN NEW ENGLAND STARTUPS
- **H2 sections**: Entrepreneurs | Investors
- **Nav**: HOME · WHO WE ARE · TEAM · SPONSORS · CONTACT US · ENTREPRENEURS · PORTFOLIO
- **CTAs/action links**: ABOUT US · CONTACT US · PORTFOLIO · MEMBER LOGIN · Folder: ABOUT US · Learn More About About Applying to Launchpad · Learn More About Launchpad Membership · Apply for Funding
- **Lead paragraph**: Launchpad is always seeking creative startups with dedicated founders. We aim to build close, long-term relationships with innovative tech and science-driven startups. We support our capital investments with advice & mentorship.
- **Signals**: LinkedIn link, Squarespace, Portfolio/case studies, Founder apply path, Member language

### Belle Capital USA (Angel · Michigan)
URL: https://bellevc.com
- **Title tag**: Belle Capital USA, LP an Early Stage Angel Fund
- **Meta description**: BELLE Capital USA is an early stage angel fund focused on building great companies in Michigan and other, underserved capital markets across the USA.
- **H1**: welcome to the belle capital usa website | NEWS
- **H2 sections**: BELLE Capital USA
- **H3 sections**: BELLE CAPITAL USA | TEAM | VC PITCH
- **CTAs/action links**: About · Investment Criteria · Investment Committee · PORTFOLIO · List of Female Angel and Early-Stage Investors in Tech · US Bancorp Invests in Finomial Platform · 7 Things Investors Love To See · Do Women Entrepreneurs Invest Differently From Men?
- **Lead paragraph**: We look for capital efficient companies with a unique product or service filling an urgent market need. We target the digital/mobile/internet (IT), technology-enabled products and services, life sciences/medical devices/health IT (Digital H
- **Signals**: Portfolio/case studies, Member language

### Women's Capital Connection (Angel · Missouri)
URL: https://womenscapitalconnection.com  →  https://womenscapitalconnection.com/home
- **Title tag**: Women's Capital Connection
- **Meta description**: Women's Capital Connection funds the most promising start-up business opportunities in the area
- **H1**: Get Your Funding Questions Answered
- **H2 sections**: What is Angel Investing? | Portfolio Companies | Latest News
- **Nav**: Connect to Funding · Equity Capital Programs · Become an Investor · News & Events · News · Events
- **CTAs/action links**: About · Contact · Portfolio Companies · Contact Us · Connect to Funding · Become an Investor · Join Now · Get Your Funding Questions Answered Angel investment could b
- **Lead paragraph**: Leverage your success to help other women in business
- **Signals**: LinkedIn link, Twitter/X, Portfolio/case studies, Member language

### Frontier Angels (Angel · Montana)
URL: https://frontierangels.com
- **Title tag**: Invest in Emerging Tech | Join Frontier Angels Today
- **Meta description**: Join Frontier Angels, the premier Montana-based network of angel investors dedicated to accelerating tech startups and fostering Montana economic growth.
- **H1**: FRONTIER ANGELS
- **H2 sections**: A Professionally managed, Montana-Based Investment Network | About Frontier Angels | OUR INVESTMENT FOCUS | WE DO NOT INVEST IN | UPCOMING MEMBER EVENTS | Testimonials
- **Nav**: Home · Angel Investing · Membership · Investments · Community · What's Next ?
- **CTAs/action links**: Member Portal · Angel Investing · Membership · Investments · BECOME A MEMBER · LEARN MORE ABOUT OUR INVESTMENT CRITERIA
- **Lead paragraph**: Frontier Angels accelerates the growth of Montana's tech ecosystem by generating returns for our investors, strengthening our communities, and creating opportunities for all Montanans. With over 100 angel investors and a curated network of 
- **Signals**: LinkedIn link, Instagram, Portfolio/case studies, Member language

### Golden Seeds (Angel · National)
URL: https://goldenseeds.com  →  https://www.goldenseeds.com/
- **Title tag**: Home | Golden Seeds
- **Meta description**: Golden Seeds is a leading angel investment network funding women-led startups for over 20 years while building a nationwide community of experienced investors.
- **H1**: Fueling Women-Led Innovation for Over 20 Years
- **H2 sections**: For Entrepreneurs Seeking Funding | For Prospective Members | From a Bold Idea to a National Movement | Latest News, Bold Thinking and Real Impact | Our Priorities | Women-Led Focus
- **Nav**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · Explore Your Fit - Info Sessions & Offic · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members
- **CTAs/action links**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members · Investor Training through the Knowledge Institute
- **Lead paragraph**: We invest in exceptional women-led startups - and build community among investors who recognize the potential of these companies.
- **Signals**: LinkedIn link, Twitter/X, Founder apply path, Member language

### Gotham Gal Ventures (Angel · National)
URL: https://gothamgal.com
- **Title tag**: Gotham Gal -
- **H1**: Seriously | The Cost of Law | Empty Buildings
- **Nav**: About · Positively Gotham Gal · Investments · Frame Home · Books · Gotham Gives Podcasts · Archive · Follow
- **CTAs/action links**: About · Investments · Books
- **Lead paragraph**: I watched this crazy documentary called Trust Me: I’m The Prophet. A mesmerizing and mind-blowing series. It is about Samuel Bateman, who arrives in Short Creek, Utah, with a group of young women, where a community of Fundamentalist Latter-
- **Signals**: Twitter/X, WordPress, Founder apply path, Member language

### Impact Invest Her (Angel · National)
URL: https://www.impactinvesther.com
- **Title tag**: impact invest her
- **H2 sections**: we are a collective of better angels | the female angel perspective is missing | ladies, it’s time we took our seats at the table | amplify the work of women-run startups while empowering female angels to use their wealth for good. | grow in good company | our process
- **Nav**: Member Resources
- **CTAs/action links**: Member Resources
- **Lead paragraph**: Impact Invest Her is a private community of female angel investors who learn together and work collaboratively to support female-led, mission-driven startups.
- **Signals**: LinkedIn link, Twitter/X, Squarespace, Portfolio/case studies, Founder apply path, Member language

### The Helm (Angel · National)
URL: https://thehelm.co
- **Title tag**: The Helm - The Helm
- **H2 sections**: The Helm invests in game-changing companies founded by women | Are you a founder looking for funding? | We are an NYC and London-based early-stage venture firm investing in women through our fund and angel syndicate . | Portfolio | Join The Helm | The Helm Review
- **Nav**: About us · Invest with us · Our Portfolio · Read The Helm Review →
- **CTAs/action links**: About us · Invest with us · Our Portfolio · Apply for funding · More about us · Learn more · View full portfolio · Invest with us / Become an LP
- **Lead paragraph**: With curbside charging posts sturdy enough to survive in the toughest urban environments and plug-and-play charging, itselectric is unlocking access to electric vehicles for millions of drivers who park their cars on the street.
- **Signals**: LinkedIn link, Instagram, Twitter/X, WordPress, Portfolio/case studies, Founder apply path, Member language

### Nebraska Angels (Angel · Nebraska)
URL: https://nebraskaangels.org  →  https://www.nebraskaangels.org/
- **Title tag**: Nebraska Angels
- **Meta description**: Founded in 2006 to support local economic development and build the entrepreneurial community. Our member-led network of accredited investors are passionate about startups and helping entrepreneurs scale with necessary capital.
- **H2 sections**: Our Angel Network | Our Impact | Privacy Policy | Terms & Conditions | Donation Refund Policy | Automated Recurring Donation Cancellation
- **Nav**: Entrepreneurs · Preparing Your Pitch · Our Process · Investment Criteria · Education · Resources · Valuation · Investors
- **CTAs/action links**: Investment Criteria · Investors · Angel Investors · Become a Member · Our Portfolio · About · Contact Us · Connecting Midwest Entrepreneurs & Investors Are you seeking
- **Lead paragraph**: Founded in 2006 to support local economic development and build the entrepreneurial community. Our member-led network of accredited investors is passionate about startups and helping entrepreneurs scale with the necessary capital.
- **Signals**: LinkedIn link, Portfolio/case studies, Founder apply path, Member language

### NH Women's Investor Network (Angel · New Hampshire)
URL: https://nnewin.org
- **Title tag**: Home - Northern New England Women's Investor Network
- **Meta description**: We are a group of women in Maine, New Hampshire and Vermont coming together to engage, learn and connect with others interested in Angel and Impact Investing
- **H2 sections**: NORTHERN NEW ENGLAND WOMEN’S INVESTOR NETWORK | NNE WIN AT A GLANCE | UPCOMING EVENTS | THANK YOU SPONSORS | GET CONNECTED | MAINE
- **Nav**: Home · About · States · Maine WIN · New Hampshire WIN · Vermont WIN · Events · NNEWIN Event Calendar
- **CTAs/action links**: About · Donate · Capital with Purpose: Women Investors Building Stronger Comm · Next Wave Impact Fund: Investor Education Page · Seraf: Guide to Angel Investing · Jean Hammond: Angel Investing 101 – 11/1/17 · Angel Investing Glossary · Confluence Impact Investing Terms
- **Lead paragraph**: NNE WIN is a coalition of women across New England who are interested in learning more about — and actively participating in — Angel and Impact investment opportunities. NNE WIN currently sponsors Tri-State events throughout New England, an
- **Signals**: WordPress, Mailchimp, Founder apply path, Member language

### New York Angels (Angel · New York)
URL: https://www.newyorkangels.com
- **Title tag**: New York Angels Investment Group
- **Meta description**: New York Angels is one of the oldest, most prominent angel investment groups in the country. New York Angels has offered early-stage entrepreneurs funding, mentoring, connections and more for over 20 years. Angel investors join New York Angels for their extensive, experienced network, increased deal flow, and improved 
- **H2 sections**: NEW YORK'S PREMIER ANGEL INVESTMENT GROUP |  | STAY UP TO DATE WITH NYA NEWS | SIGN UP FOR OUR NEWSLETTER
- **Nav**: Early-Stage Entrepreneurs · Investment Process · Entrepreneur Resources · Founder Spotlights · Apply for Funding · Membership Benefits & Criteria · New York Angels Members · Angel Resources
- **CTAs/action links**: Investment Process · Apply for Funding · Membership Benefits & Criteria · New York Angels Members · Member Spotlights · Inquire About NYA Membership · Portfolio · About
- **Lead paragraph**: Sign up to receive latest news, updates and exclusive event invitations from the New York Angels.
- **Signals**: LinkedIn link, Twitter/X, Squarespace, Google Form, Portfolio/case studies, Founder apply path, Member language

### xElle Ventures (Angel · North Carolina)
URL: https://xelleventures.com  →  https://www.xelleventures.com/
- **Title tag**: xElle Ventures
- **H2 sections**: What our funded founders say! | Stemz | Aurora Flow | Fabalish | Three Strands Recovery Wear | Bookelicious
- **Nav**: Home · Explore Funding · Our Members · Contact
- **CTAs/action links**: Explore Funding · Our Members · Contact · Apply for Funding · Learn about funding · Meet our members · Bookelicious
- **Lead paragraph**: Stemz is a cut-flower wholesaler partnering directly with flower farmers to provide 100% regionally grown blooms to floral creatives at scale. Through its Priority Advance Order service and Live Field Inventory, Stemz offers reliable access
- **Signals**: LinkedIn link, Squarespace, Google Form, Portfolio/case studies, Founder apply path, Member language

### X Squared Angels (Angel · Ohio)
URL: https://xsquaredangels.com
- **Title tag**: 

### Broad Street Angels (Angel · Pennsylvania)
URL: https://unionleague.org  →  https://www.unionleague.org/
- **Title tag**: The Union League - Home
- **Meta description**: Founded in 1862 as a patriotic society to support the Union and the policies of President Abraham Lincoln, The Union League of Philadelphia laid the philosophical foundation of other Union Leagues across a nation torn by civil war. The League has hosted U.S. presidents, heads of state, industrialists, entertainers and 
- **H2 sections**: The Union League of Philadelphia, ranked the #1 City Club in the Country, for an unprecedented seventh consecutive time, is a shining jewel of history in a city defined by such treasure. | History | Membership | League Life | Be Our Guest | Golf
- **CTAs/action links**: Member Login · Membership
- **Lead paragraph**: Founded in 1862 as a patriotic society to support the Union and the policies of President Abraham Lincoln, The Union League of Philadelphia laid the philosophical foundation of other Union Leagues across a nation torn by civil war. The Leag
- **Signals**: WordPress, Founder apply path, Member language

### Golden Seeds (Philly) (Angel · Pennsylvania)
URL: https://goldenseeds.com  →  https://www.goldenseeds.com/
- **Title tag**: Home | Golden Seeds
- **Meta description**: Golden Seeds is a leading angel investment network funding women-led startups for over 20 years while building a nationwide community of experienced investors.
- **H1**: Fueling Women-Led Innovation for Over 20 Years
- **H2 sections**: For Entrepreneurs Seeking Funding | For Prospective Members | From a Bold Idea to a National Movement | Latest News, Bold Thinking and Real Impact | Our Priorities | Women-Led Focus
- **Nav**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · Explore Your Fit - Info Sessions & Offic · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members
- **CTAs/action links**: Entrepreneurs Seeking Funding · Funding Criteria & Eligibility · How to Apply · Prospective Members · Why Join Golden Seeds · Member Benefits · Events for Prospective Members · Investor Training through the Knowledge Institute
- **Lead paragraph**: We invest in exceptional women-led startups - and build community among investors who recognize the potential of these companies.
- **Signals**: LinkedIn link, Twitter/X, Founder apply path, Member language

### Falls Angel Fund (Angel · South Dakota)
URL: https://fallsangelfund.com
- **Title tag**: Site not found · DreamHost
- **Meta description**: The owner of this domain has not yet uploaded their website.
- **H1**: Site Not Found
- **CTAs/action links**: contact support
- **Lead paragraph**: Well, this is awkward. The site you're looking for is not here.

### The JumpFund (Angel · Tennessee)
URL: https://thejumpfund.com  →  https://www.thejumpfund.com/
- **Title tag**: Women investing in Women. | The JumpFund | Chattanooga
- **Meta description**: The JumpFund is an all women investment group investing only in women-led ventures in the Southeastern United States.
- **H1**: Women Investing in Women
- **H2 sections**: Our portfolio companies share two things in common—each are led by aspirational women entrepreneurs and founded in the Southeast. | Jumping In
- **Nav**: Home · Portfolio · About · Resources · Jump In
- **CTAs/action links**: Portfolio · About
- **Signals**: LinkedIn link, Instagram, Twitter/X, Wix, Mailchimp, Portfolio/case studies, Founder apply path

### BEAM Network (Angel · Texas)
URL: https://www.thebeamnetwork.com
- **Title tag**: The Beam Network
- **Meta description**: The Beam Network is a global community of women wealth holders who empower one another, through connection and financial education, to invest in line with their values and create a better world.
- **H1**: BUILT FOR WOMEN INVESTORS, BY WOMEN INVESTORS | CHANGE THROUGH KNOWLEDGE | CONNECTION AND COMMUNITY
- **H2 sections**: WHAT WE DO | MEMBERSHIP | COMING UP
- **Nav**: ABOUT US · CO-FOUNDERS · OUR VISION · TEAM · WHAT WE DO · MEMBERSHIP · MEMBER OVERVIEW · BECOMING A MEMBER
- **CTAs/action links**: ABOUT US · MEMBERSHIP · MEMBER OVERVIEW · BECOMING A MEMBER · MEMBER EVENTS · MEMBER LOG IN · JOIN US · Learn more
- **Lead paragraph**: The Beam Network is a private financial education platform and global community for women of significant wealth, empowering one another to lead with confidence, invest with purpose, and shape a better world.
- **Signals**: LinkedIn link, Instagram, Twitter/X, Wix, Founder apply path, Member language

### SeaChange Fund (Angel · Washington)
URL: https://seachange.fund
- **STATUS**: FETCH ERROR — URLError: <urlopen error [Errno 8] nodename nor servname provided, or not known>

### Wyoming Angel Network (Angel · Wyoming)
URL: https://wyomingbusiness.org
- **Title tag**: Home - Wyoming Business Council
- **Meta description**: A Resilient Wyoming Begins with You
- **H1**: Creating Capacity | Our Mission
- **H2 sections**: Why Wyoming? | Recent News | Available Properties | Social | Resources
- **Nav**: Wyoming Business Council · Broadband · Wyoming Table · Team of 1000s
- **CTAs/action links**: Start · Startup Resources · Startup Financing · About · State Loan and Investment Board · WBC Welcomes Two New Board Members and Holds Special Meeting · Facebook · Subscribe
- **Lead paragraph**: Visit our Team of Thousands pages to find the tools you need to strengthen your community.
- **Signals**: LinkedIn link, Instagram, WordPress, Founder apply path, Member language


---

## Syndicates (19)

### The Council Angels (Syndicate · California)
URL: https://www.thecouncil.co
- **Title tag**: The Council
- **H2 sections**: Amber Illig, Founding General Partner | Rachel Tsui, Partner
- **H3 sections**: We invest in high slope operators who are reshaping the essential industries we rely on every day. | We back First Builders. | We are First Builders ourselves.
- **Nav**: Portfolio · Podcast · Angels · Pitch Us
- **CTAs/action links**: Portfolio
- **Lead paragraph**: Founding Lawyer Amazon Alexa -> VP Legal Cruise -> GC Replit -> Cofounder of GC AI
- **Signals**: LinkedIn link, Instagram, Twitter/X, Squarespace, Portfolio/case studies, Founder apply path

### 360 Venture Collective (Syndicate · Florida)
URL: https://360venturecollective.com  →  https://www.360venturecollective.com/
- **Title tag**: 360 Venture Collective - Making Space for Purpose + Profit™
- **Meta description**: 360 Venture Collective is a woman-founded and led venture firm based in Miami, Florida with an intentionally inclusive investment thesis.
- **H1**: Making Space for Purpose + Profit™
- **H2 sections**: Team | ArcAccelerator | Unifying Investment | Empowering Impact Entrepreneurs | Contact Us
- **Nav**: Home · Approach · Team · Accelerator · Philosophy · Contact
- **CTAs/action links**: Contact · Apply Now > · Learn More >
- **Signals**: LinkedIn link, Twitter/X, Wix, Founder apply path, Member language

### Impact Engine (Syndicate · Illinois)
URL: https://theimpactengine.com  →  https://www.theimpactengine.com/
- **Title tag**: IMPACT ENGINE
- **Meta description**: Impact Engine is a venture capital and private equity firm investing in companies driving positive impact in economic empowerment, education, environmental sustainability, and health.
- **H1**: 
- **H2 sections**: Bernstein Private Wealth Management Deepens Partnership with Impact Engine | ANNOUNCING $85M CLOSE OF OUR SECOND PE FUND | IMPACT ENGINE ANNOUNCES CLOSE OF INAUGURAL VINTAGE IN PARTNERSHIP WITH BERNSTEIN PRIVATE WEALTH MANAGEMENT | IE Aims to Drive Sustainability Mainstream
- **Nav**: Who We Are · Team · Investment Strategy · Impact Strategy · Learn · Midwest 2024 · Book · Chicago
- **CTAs/action links**: Investment Strategy · Book · CONTACT US · Learn More → · Latest Investment · Why We Invested in Paladin · Sign Up · The Little Book of Impact Investing
- **Lead paragraph**: WE INVEST TO OPTIMIZE BOTH FINANCIAL AND SOCIAL RETURNS.
- **Signals**: LinkedIn link, Squarespace, Portfolio/case studies, Founder apply path

### Angel Squad (Hustle Fund) (Syndicate · National)
URL: https://www.hustlefund.vc
- **Title tag**: Welcome fine hustler, we’re glad you stopped by! | Hustle Fund
- **Meta description**: Hustle Fund is a venture capital fund investing in hustlers at the pre-seed and seed stages. We’d love to learn more about what you’re hustling!
- **H1**: Angel invest into our top portfolio companies! | Upcoming Events | Our newsletters are so good, you'll be pooping hippo rainbows!
- **Nav**: Meet the Portfolio · Prepare for your Hustle Fund Pitch · EVENT: Founder Friends · Grow with Redwood School · Founder FAQ · EVENT: Batter Up! · Angel Squad · BLOG: The Founder Playbook (Founders)
- **CTAs/action links**: Meet the Portfolio · BLOG: The Founder Playbook (Founders) · BLOG: Small Bets (Investors) · READ: Deck Doctors Pitch Deck Book · READ: Raise Millions Book · READ: Democratizing Knowledge Book · SIGN UP: Get the Newsletters · JOIN: Events
- **Lead paragraph**: We can make a decision to invest within 1-2 meetings, and we will wire within the week. We don’t wait for someone else to lead, as that is BS.
- **Signals**: LinkedIn link, Twitter/X, Webflow, Mailchimp, Calendly, Typeform, Portfolio/case studies

### Astia Angels (Syndicate · National)
URL: https://astia.org  →  https://www.astia.org/
- **Title tag**: Astia - Inclusion, Innovation, Investment.
- **Meta description**: Founded in 2000 by tech pioneer Catherine Muther, Astia has remained steadfast in its commitment to creating a more equitable venture capital landscape.
- **H1**: Today's most impactful high-growth companies are led by inclusive teams.
- **H2 sections**: ABOUT US | We invest in high-performing women-led companies that solve global problems. | ASTIA | WHY US | Astia is the global pioneer investing in companies led by women.
- **Nav**: About Us · Our Process · Our History · Our Team · Thought Leadership · FAQs · Apply · Portfolio
- **CTAs/action links**: About Us · Apply · Portfolio · Explore Our Portfolio · Learn more about our history > · Learn more about our process >
- **Signals**: LinkedIn link, Instagram, Twitter/X, WordPress, Wix, Portfolio/case studies, Founder apply path, Member language

### Black Girl Ventures (Syndicate · National)
URL: https://blackgirlventures.org  →  https://www.blackgirlventures.org/
- **Title tag**: HOME | Black Girl Ventures
- **H1**: Your Donation Keeps Small Businesses Hiring | Your gift builds the hiring capacity small businesses need to create jobs, support families, and strengthen local economies.
- **H2 sections**: 3 | 338 | 5146 | , | 17012 | 41709
- **Nav**: ABOUT · TEAM & BOARD · OUR IMPACT · OUR PARTNERS · FAQS · PROGRAMS · PULL UP & PITCH · EMERGING LEADERS FELLOWSHIP 2.0
- **CTAs/action links**: ABOUT · DONATE · LEARN MORE · JOIN NOW · MORE ABOUT OUR IMPACT · contact@blackgirlventures.org
- **Lead paragraph**: Your funding powers these life-changing moments creating opportunities
- **Signals**: LinkedIn link, Instagram, Twitter/X, WordPress, Wix, Founder apply path, Member language

### Brydge Club (Syndicate · National)
URL: https://brydgeclub.com  →  https://www.brydgeclub.com/
- **Title tag**: Brydge Club — More women on cap tables
- **Meta description**: Join a private collective of female angel investors, learn to invest, and access vetted deal flow.
- **H1**: We get women on cap tables.
- **H2 sections**: Membership Includes | Everything You Need to Know | Apply to join our next cohort.
- **Nav**: Membership · FAQ
- **CTAs/action links**: Membership · Member login · Apply → · Apply for the next cohort → · Apply now → · Apply
- **Lead paragraph**: Join a private collective of female angel investors, learn to invest, and access vetted deal flow.
- **Signals**: Portfolio/case studies, Founder apply path, Member language

### Coralus (formerly SheEO) (Syndicate · National)
URL: https://coralus.world  →  https://www.coralus.world/
- **Title tag**: Coralus 2025 RESET
- **Meta description**: The Coralus RESET is in motion. Watch what's unfolding by the next Harvest Supermoon.
- **Lead paragraph**: Although we aren’t welcoming new members right now, if you feel drawn to Coralus — or if you’ve been with us before — we’d love to connect and keep you informed about the next opening. Send us a note at [email protected] if you're intereste
- **Signals**: LinkedIn link, Instagram, Twitter/X, Member language

### Gaingels (Syndicate · National)
URL: https://gaingels.com
- **STATUS**: FETCH ERROR — HTTPError: HTTP Error 403: Forbidden

### She Angel Investors (Syndicate · National)
URL: https://www.sheangelinvestors.com
- **Title tag**: She Angel Investors | Empowering Women Investors & Entrepreneurs
- **Meta description**: Join She Angel Investors to connect with women investors, entrepreneurs, founders, and experts. Discover resources, events, and opportunities to build wealth.
- **H2 sections**: Building Women's Wealth | through Entrepreneurship and Investments. | FILM | SPEAKER | PODCAST | BOOK
- **Nav**: Home · About · About She Angel Investors · Film · Books · Blog · Contact Us · Events
- **CTAs/action links**: About · About She Angel Investors · Books · Contact Us · Learn More · Get the Book · Facebook
- **Lead paragraph**: Our platform provides multi-media resources to help you navigate your entrepreneurial endeavors and empowers women to build wealth by connecting them to experts and opportunities. She Angel Investors empowers women investors and entrepreneu
- **Signals**: LinkedIn link, Instagram, WordPress, Founder apply path

### StartOut (Syndicate · National)
URL: https://startout.org
- **Title tag**: StartOut | Leading Nonprofit Empowering LGBTQ+ Entrepreneurs
- **Meta description**: As the leading nonprofit supporting LGBTQ+ entrepreneurs, StartOut is on a mission to accelerate the LGBTQ+ community's growth to drive economic empowerment.
- **H1**: Empowering LGBTQ+ & Allied Entrepreneurs
- **H2 sections**: 28K | 1,829 | $1.58B | $5.8B | Who We Serve | What We Offer
- **Nav**: About Us · Team · Code of Conduct · Sponsors & Major Donors · Partners · Founders · Our Founders · Founders Program
- **CTAs/action links**: About Us · How to get started · StartOut Events · StartOut Con · Investors · StartOut Index · Contact Us · Donate
- **Lead paragraph**: Building a world where every entrepreneur can thrive on a level playing field.
- **Signals**: LinkedIn link, Instagram, Twitter/X, WordPress, Mailchimp, Founder apply path

### The Josephine Collective (Syndicate · National)
URL: https://joinjosephine.com
- **Title tag**: The Josephine Collective – A women-led investment group funding visionary founders across the U.S.
- **Meta description**: A women-led angel investment group funding early stage founders from every industry across the united states.
- **H1**: The Josephine Collective | Early Stage Investing for All | Who We Are
- **H2 sections**: Why “Josephine”? |  | 
- **Nav**: Founders · Investors · Portfolio · Join Us
- **CTAs/action links**: Investors · Portfolio · Join Us · Join Our Angel Group · Apply For Funding · apply · Subscribe · Sign up
- **Lead paragraph**: A women-led investment group funding visionary founders across the U.S.
- **Signals**: LinkedIn link, WordPress, Portfolio/case studies, Founder apply path, Member language

### iFundWomen (Syndicate · National)
URL: https://ifundwomen.com  →  https://www.ifundwomen.com/
- **Title tag**: IFW by Honeycomb Credit Funding Platform for Small Businesses
- **Meta description**: IFW by Honeycomb Credit is the go-to funding platform for small businesses providing access to capital through crowdfunding, corporate grants, and access to SBA loans; expert business coaching, and a community of over 550,000 founders and funders.
- **H1**: IFundWomen Homepage
- **H2 sections**: Search | Need fair funding options? Find out if you prequalify for a Honeycomb Community Capital Loan in seconds. | When small businesses get funded, everybody wins.
- **Nav**: Login · Sign Up · Get Funding · Start Crowdfunding · Apply for Grants · Get Investors · 7(A) Working Capital Loans · Fundraising Tools
- **CTAs/action links**: Sign Up · Get Funding · Start Crowdfunding · Apply for Grants · Get Investors · Fund Startups · About · Contact Us
- **Lead paragraph**: Main Street's go-to funding platform for small businesses.
- **Signals**: LinkedIn link, Instagram, Mailchimp, Founder apply path

### Girl Math Capital (Syndicate · New York)
URL: https://girlmath.capital
- **Title tag**: Girl Math Capital
- **H2 sections**: Our Story | Deals we’ve invested in | For Applicants | For Founders | For Partnerships | Subscribe to Our Newsletter
- **Nav**: Home · About · Membership · Pitch Us · Hire from GMC · Events · Newsletter
- **CTAs/action links**: About · Membership · community membership · Apply Now · Sign Up
- **Lead paragraph**: Each woman who is a part of Girl Math Capital works to define her own unique investment thesis. As a result, we invest in deals across asset classes and companies across industries and stages.
- **Signals**: LinkedIn link, Instagram, Twitter/X, Squarespace, Google Form, Portfolio/case studies, Founder apply path, Member language

### InvestinKin (Syndicate · New York)
URL: https://www.investinkin.com  →  https://www.hugedomains.com/domain_profile.cfm?d=investinkin.com
- **Title tag**: InvestInkin.com is for sale | HugeDomains
- **Meta description**: Join thousands of people who own a premium domain. Affordable financing available.
- **H1**: InvestInkin.com
- **H2 sections**: Since 2005, we've helped thousands of people get the perfect domain name | Our promise to you | FAQs | Other domains you might like | Quick stats
- **Nav**: Home · FAQs · About us · Contact us · My account · My favorites · Shopping cart
- **CTAs/action links**: About us · Contact us · ▸ Start payment plan · HiInvest.com · InvestYf.com · Invest
- **Lead paragraph**: Buy now for $2,995 or pay $124.79 per month for 24 months
- **Signals**: Portfolio/case studies

### Plum Alley Ventures (Syndicate · New York)
URL: https://plumalley.co
- **Title tag**: Plum Alley
- **Meta description**: Plum Alley Ventures Company is an operating company that facilitates smart investment in forward leaning technologies for humans, industry and the planet.
- **H1**: Bold Vision.
- **H2 sections**: Why do we exist? | What we offer investors
- **Nav**: About Us · Team · Partners · SPV Portfolio · Venture Fund 1 · Membership · Funds · Contact
- **CTAs/action links**: About Us · SPV Portfolio · Membership · Contact · Learn more · Contact Us · Sign up
- **Signals**: Webflow, Portfolio/case studies, Member language

### Hatch Innovation (Syndicate · Oregon)
URL: https://hatchthefuture.org
- **Title tag**: Domain for Sale – hatchthefuture.org | Brandable & Ready to Use
- **Meta description**: Get the premium domain hatchthefuture.org a brandable, easy-to-remember name perfect for your next startup or niche business.
- **H1**: hatchthefuture.org
- **Lead paragraph**: Looking for a powerful and brandable domain? hatchthefuture.org is now available for acquisition. This domain is easy to remember, suitable for a wide range of industries, and perfect for entrepreneurs, startups, or niche projects looking f

### BlueTree Allied Angels (Syndicate · Pennsylvania)
URL: https://bluetreealliedangels.com
- **STATUS**: FETCH ERROR — HTTPError: HTTP Error 401: Unauthorized

### Ascending Angels (Syndicate · Virginia)
URL: https://www.ascendingangelsinc.org
- **Title tag**: Ascending Angels - Home
- **Meta description**: Ascending Angels Inc.’s mission is to enable individuals to transition with dignity. It is our core belief that every individual deserves a final resting place. This final resting garden will...
- **H2 sections**: Ascending Angels | Mission Statement | Vision Statement | Our Story | How You Can Help
- **Nav**: Home · About Us · Contact Us · Blueprint · Memory Wall · Donor Wall · Donate Now · Donate
- **CTAs/action links**: About Us · Contact Us · Donate Now · Donate
- **Signals**: Member language

