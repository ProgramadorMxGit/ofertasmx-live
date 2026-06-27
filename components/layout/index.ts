/**
 * Layout chrome components (Task 25).
 *
 * `Header` and `MobileNav` are Client Components (scroll state + drawer);
 * `Footer` and `TrustBar` are Server Components. `ThemeToggle` is the existing
 * Client toggle. These are mounted into the page shells in Task 26.
 */
export { Header } from "./header";
export type { HeaderProps } from "./header";
export { Hero } from "./hero";
export type { HeroProps } from "./hero";
export { MobileNav } from "./mobile-nav";
export type { MobileNavProps } from "./mobile-nav";
export { Footer } from "./footer";
export type { FooterProps } from "./footer";
export { TrustBar } from "./trust-bar";
export type { TrustBarProps } from "./trust-bar";
export { ThemeToggle } from "./theme-toggle";
export { NAV_LINKS } from "./nav-links";
export type { NavLink } from "./nav-links";
