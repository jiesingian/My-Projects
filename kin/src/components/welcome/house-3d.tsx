/** The home page's house: built from CSS faces in 3D rather than an image or
 * a WebGL scene, so it costs no download, stays sharp at any size, and takes
 * the page's colours. It turns slowly on its own and stands still for anyone
 * who has asked their device for less motion. Decorative: the words beside it
 * carry the meaning. */
export function House3D() {
  return (
    <div className="kin-house" aria-hidden="true">
      <div className="kin-house-ground" />
      <div className="kin-house-rot">
        {/* The front is the app icon (public/icon.svg) made solid: a white
            house with the family standing on its floor. */}
        <div className="kin-house-face kin-house-front">
          <svg className="kin-house-family" viewBox="314 488 396 262" aria-hidden="true">
            <g fill="#e8506a">
              <circle cx="404" cy="548" r="60" />
              <circle cx="620" cy="548" r="60" />
              <path d="M314 750v-50c0-50 40-90 90-90s90 40 90 90v50z" />
              <path d="M530 750v-50c0-50 40-90 90-90s90 40 90 90v50z" />
            </g>
            <g fill="#f07a55" stroke="#fff" strokeWidth="14">
              <circle cx="512" cy="636" r="44" />
              <path d="M446 760v-18c0-36 30-64 66-64s66 28 66 64v18z" />
            </g>
          </svg>
        </div>
        <div className="kin-house-face kin-house-back">
          <span className="kin-house-window" style={{ left: "38%", top: "26%" }} />
        </div>
        <div className="kin-house-face kin-house-left">
          <span className="kin-house-window" style={{ left: "30%", top: "28%" }} />
        </div>
        <div className="kin-house-face kin-house-right">
          <span className="kin-house-window" style={{ left: "30%", top: "28%" }} />
        </div>
        <div className="kin-house-face kin-house-floor" />
        <div className="kin-house-face kin-house-roof kin-house-roof-front" />
        <div className="kin-house-face kin-house-roof kin-house-roof-back" />
        <div className="kin-house-face kin-house-gable kin-house-gable-left">
          <svg className="kin-house-heart" viewBox="464 343 96 81" aria-hidden="true"><path d="M512 424c-30-21-48-37-48-57 0-14 11-24 24-24 10 0 19 6 24 15 5-9 14-15 24-15 13 0 24 10 24 24 0 20-18 36-48 57z" fill="#f07a55" /></svg>
        </div>
        <div className="kin-house-face kin-house-gable kin-house-gable-right">
          <svg className="kin-house-heart" viewBox="464 343 96 81" aria-hidden="true"><path d="M512 424c-30-21-48-37-48-57 0-14 11-24 24-24 10 0 19 6 24 15 5-9 14-15 24-15 13 0 24 10 24 24 0 20-18 36-48 57z" fill="#f07a55" /></svg>
        </div>
        <div className="kin-house-face kin-house-chimney" />
      </div>
    </div>
  );
}
