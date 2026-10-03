function initSubmenus() {

  const submenuParents = document.querySelectorAll(".dropdown-submenu");
  if (!submenuParents.length) return;

  submenuParents.forEach((submenuParent) => {

    const submenu = submenuParent.querySelector(".submenu");
    const trigger = submenuParent.querySelector("a");

    if (!submenu || !trigger) return;

    if (window.innerWidth <= 768) {
      return;
    }

    // Force submenu styles (no CSS needed)
    Object.assign(submenu.style, {
      position: "fixed",
      display: "none",
      width: "max-content",
      whiteSpace: "nowrap",
      background: "#fff",
      zIndex: "99999",
      padding: "0",
      margin: "0",
      listStyle: "none",
      boxShadow: "0 4px 12px rgba(0,0,0,0.15)"
    });

    let submenuOpen = false;

    function openSubmenu() {

      submenu.style.display = "block";

      const rect = trigger.getBoundingClientRect();
      const menuRect = submenu.getBoundingClientRect();

      let left;
      let top;

      // MOBILE → open downward
      if (window.innerWidth <= 768) {

        left = rect.left;
        top = rect.bottom + 5;

        // Prevent right overflow on mobile
        if (left + menuRect.width > window.innerWidth) {
          left = window.innerWidth - menuRect.width - 10;
        }

      }

      // DESKTOP → open sideways
      else {

        left = rect.right;
        top = rect.top;

        // Prevent overflow right
        if (left + menuRect.width > window.innerWidth) {
          left = rect.left - menuRect.width;
        }

      }

      // Prevent bottom overflow (all devices)
      if (top + menuRect.height > window.innerHeight) {
        top = window.innerHeight - menuRect.height - 10;
      }

      submenu.style.left = left + "px";
      submenu.style.top = top + "px";

      submenuOpen = true;
    }

    function closeSubmenu() {
      submenu.style.display = "none";
      submenuOpen = false;
    }

    // Desktop hover
    submenuParent.addEventListener("mouseenter", () => {
      if (window.innerWidth > 768) {
        openSubmenu();
      }
    });

    submenuParent.addEventListener("mouseleave", () => {
      if (window.innerWidth > 768) {
        closeSubmenu();
      }
    });

    // Click outside closes menu
    document.addEventListener("click", (e) => {
      if (
        submenuOpen &&
        !submenuParent.contains(e.target) &&
        !submenu.contains(e.target)
      ) {
        closeSubmenu();
      }
    });

  });

}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initSubmenus);
} else {
  initSubmenus();
}
