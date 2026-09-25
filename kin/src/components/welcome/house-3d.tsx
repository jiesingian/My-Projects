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
        <div className="kin-house-face kin-house-front">
          <span className="kin-house-window" style={{ left: "14%", top: "22%" }} />
          <span className="kin-house-window" style={{ right: "14%", top: "22%" }} />
          <span className="kin-house-door" />
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
        <div className="kin-house-face kin-house-gable kin-house-gable-left" />
        <div className="kin-house-face kin-house-gable kin-house-gable-right" />
        <div className="kin-house-face kin-house-chimney" />
      </div>
    </div>
  );
}
