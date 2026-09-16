import { redirect } from "next/navigation";

/* The home page is built separately — its hero is signed off and out of
   scope. Until it lands, the root routes to the primary service page
   rather than serving a 404. */
export default function Home() {
  redirect("/edible-oil-transportation");
}
