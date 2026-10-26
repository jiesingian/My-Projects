/** Adding a task or an event: the Planner's add page under an address of its
 * own, so that adding opens as a sheet over the page it came from (@modal)
 * while /planner/add?id=... -- opening an event or a task that exists, with
 * its photos, answers and thread -- stays a page. Links that add something
 * new point here; /planner/add still adds too, for links already out in the
 * world. */
export { default } from "../add/page";
