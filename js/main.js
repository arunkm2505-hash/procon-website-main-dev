// PROCON INFRA LLP — shared site behaviour
(function(){
  "use strict";

  document.addEventListener("DOMContentLoaded", function(){

    /* ---------- nav bubble highlight ---------- */
    var pillGroups = document.querySelectorAll(".nav-pills");
    pillGroups.forEach(function(group){
      var glow = group.querySelector(".nav-pills__glow");
      var links = group.querySelectorAll(".nav-link");
      if(!glow || !links.length) return;

      function moveTo(el){
        var gr = group.getBoundingClientRect();
        var lr = el.getBoundingClientRect();
        glow.style.width = lr.width + "px";
        glow.style.transform = "translateX(" + (lr.left - gr.left - 5) + "px)";
        glow.style.opacity = "1";
      }
      function reset(){
        var active = group.querySelector(".nav-link.is-active");
        if(active){ moveTo(active); } else { glow.style.opacity = "0"; }
      }
      links.forEach(function(link){
        link.addEventListener("mouseenter", function(){ moveTo(link); });
      });
      group.addEventListener("mouseleave", reset);
      window.addEventListener("resize", reset);
      setTimeout(reset, 60);
    });

    /* ---------- dropdown (desktop click-away + mobile) ---------- */
    document.querySelectorAll(".nav-item.has-dropdown > .nav-link").forEach(function(trigger){
      trigger.addEventListener("click", function(e){
        if(window.innerWidth <= 980){
          e.preventDefault();
          trigger.parentElement.classList.toggle("open");
        }
      });
    });

    /* ---------- mobile drawer ---------- */
    var toggle = document.querySelector(".navbar__toggle");
    var drawer = document.querySelector(".mobile-drawer");
    var drawerClose = document.querySelector(".mobile-drawer__close");
    function openDrawer(){ drawer.classList.add("open"); document.body.classList.add("drawer-open"); }
    function closeDrawer(){ drawer.classList.remove("open"); document.body.classList.remove("drawer-open"); }
    if(toggle && drawer){
      toggle.addEventListener("click", openDrawer);
      if(drawerClose) drawerClose.addEventListener("click", closeDrawer);
      drawer.querySelectorAll("a:not(.mdrop__head)").forEach(function(a){
        a.addEventListener("click", closeDrawer);
      });
    }
    document.querySelectorAll(".mdrop__head").forEach(function(head){
      head.addEventListener("click", function(){
        head.parentElement.classList.toggle("open");
      });
    });

    /* ---------- scroll reveal ---------- */
    var revealEls = document.querySelectorAll(".reveal");
    if("IntersectionObserver" in window && revealEls.length){
      var io = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(entry.isIntersecting){
            entry.target.classList.add("in-view");
            io.unobserve(entry.target);
          }
        });
      }, {threshold:.02, rootMargin:"0px 0px -10% 0px"});
      revealEls.forEach(function(el, i){
        el.style.setProperty("--i", i % 8);
        io.observe(el);
      });
    } else {
      revealEls.forEach(function(el){ el.classList.add("in-view"); });
    }

    /* ---------- back to top ---------- */
    var toTop = document.querySelector(".to-top");
    if(toTop){
      window.addEventListener("scroll", function(){
        toTop.classList.toggle("show", window.scrollY > 560);
      });
      toTop.addEventListener("click", function(){
        window.scrollTo({top:0, behavior:"smooth"});
      });
    }

    /* ---------- spotlight card cursor glow ---------- */
    document.querySelectorAll(".spot-card").forEach(function(card){
      card.addEventListener("mousemove", function(e){
        var r = card.getBoundingClientRect();
        card.style.setProperty("--mx", (e.clientX - r.left) + "px");
        card.style.setProperty("--my", (e.clientY - r.top) + "px");
      });
    });

    /* ---------- animated counters ---------- */
    var counters = document.querySelectorAll(".count[data-target]");
    if(counters.length && "IntersectionObserver" in window){
      var cio = new IntersectionObserver(function(entries){
        entries.forEach(function(entry){
          if(!entry.isIntersecting) return;
          var el = entry.target;
          var target = parseFloat(el.getAttribute("data-target"));
          var decimals = (el.getAttribute("data-target").split(".")[1] || "").length;
          var suffix = el.getAttribute("data-suffix") || "";
          var dur = 1400, start = null;
          function step(ts){
            if(!start) start = ts;
            var p = Math.min((ts - start) / dur, 1);
            var eased = 1 - Math.pow(1 - p, 3);
            el.textContent = (target * eased).toFixed(decimals) + suffix;
            if(p < 1) requestAnimationFrame(step);
          }
          requestAnimationFrame(step);
          cio.unobserve(el);
        });
      }, {threshold:.5});
      counters.forEach(function(el){ cio.observe(el); });
    }

    /* ---------- gentle tilt on pointer move ---------- */
    document.querySelectorAll(".tilt").forEach(function(card){
      card.addEventListener("mousemove", function(e){
        var r = card.getBoundingClientRect();
        var px = (e.clientX - r.left) / r.width - .5;
        var py = (e.clientY - r.top) / r.height - .5;
        card.style.transform = "perspective(900px) rotateX(" + (py * -6) + "deg) rotateY(" + (px * 8) + "deg) translateY(-4px)";
      });
      card.addEventListener("mouseleave", function(){ card.style.transform = ""; });
    });

    /* ---------- scroll driven effects (one rAF throttled listener) ---------- */
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    // tagline: split into words that light up in reading order
    var words = [];
    document.querySelectorAll("[data-words]").forEach(function(el){
      el.innerHTML = el.textContent.trim().split(/\s+/).map(function(w){ return '<span class="w">' + w + '</span>'; }).join(" ");
      words = words.concat([].slice.call(el.querySelectorAll(".w")));
    });

    // gentle parallax on large photos
    var plx = [].slice.call(document.querySelectorAll(".rounded-media img, .project-card__media img"));
    plx.forEach(function(img){ img.style.willChange = "transform"; });

    // process timeline: steps fill as they cross the middle of the viewport
    var steps = [].slice.call(document.querySelectorAll(".step"));

    var ticking = false;
    function onScrollFrame(){
      ticking = false;
      var vh = window.innerHeight;
      for(var i = 0; i < words.length; i++){
        words[i].classList.toggle("on", reduce || words[i].getBoundingClientRect().top < vh * .72);
      }
      if(!reduce){
        plx.forEach(function(img){
          var r = img.parentElement.getBoundingClientRect();
          if(r.bottom < 0 || r.top > vh) return;
          var off = ((r.top + r.height / 2) - vh / 2) / vh;
          img.style.transform = "translateY(" + (off * -28).toFixed(1) + "px) scale(1.08)";
        });
      }
      steps.forEach(function(s){
        s.classList.toggle("is-active", s.getBoundingClientRect().top < vh * .6);
      });
    }
    if(words.length || plx.length || steps.length){
      window.addEventListener("scroll", function(){
        if(!ticking){ ticking = true; requestAnimationFrame(onScrollFrame); }
      }, {passive:true});
      onScrollFrame();
    }

    /* ---------- contact form (static demo) ---------- */
    var form = document.querySelector("#contact-form");
    if(form){
      form.addEventListener("submit", function(e){
        e.preventDefault();
        var success = document.querySelector("#form-success");
        if(success){ success.classList.add("show"); }
        form.reset();
        if(success){ success.scrollIntoView({behavior:"smooth", block:"center"}); }
      });
    }

  });
})();
