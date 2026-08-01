export function VisionFieldGraphic() {
  return (
    <div className="v4-brand-field v4-brand-field--vision" aria-hidden="true">
      <svg viewBox="0 0 720 520" role="presentation" focusable="false">
        <defs>
          <linearGradient id="vision-signal-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#7257df" />
            <stop offset="0.52" stopColor="#38a8c0" />
            <stop offset="1" stopColor="#65d8bc" />
          </linearGradient>
        </defs>
        <g className="v4-brand-field__orbit">
          <path d="M93 311C145 112 393 42 591 159c119 70 99 218-29 286-157 83-386 28-469-134Z" />
          <path d="M151 345c32-151 213-244 377-175 112 47 139 164 53 242-111 101-349 78-430-67Z" />
          <path d="M235 355c13-96 119-171 226-145 91 22 136 105 91 174-64 98-257 83-317-29Z" />
        </g>
        <path
          className="v4-brand-field__trajectory"
          d="M65 402c120-33 166-190 286-196 111-6 148 123 292 54"
          pathLength="1"
        />
        <g className="v4-brand-field__cells" fill="url(#vision-signal-gradient)">
          <circle cx="65" cy="402" r="5" />
          <circle cx="203" cy="302" r="4" />
          <circle cx="351" cy="206" r="6" />
          <circle cx="489" cy="268" r="4" />
          <circle cx="643" cy="260" r="5" />
        </g>
      </svg>
    </div>
  );
}

export function ExperienceFieldGraphic() {
  return (
    <div className="v4-brand-field v4-brand-field--experience" aria-hidden="true">
      <svg viewBox="0 0 1200 420" role="presentation" focusable="false">
        <defs>
          <linearGradient id="experience-signal-gradient" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="#3b91ae" />
            <stop offset="0.55" stopColor="#6d5bd5" />
            <stop offset="1" stopColor="#2ab6a8" />
          </linearGradient>
        </defs>
        <g className="v4-brand-field__rails">
          <path d="M34 310h184l88-122h184l90 68h168l86-142h330" pathLength="1" />
          <path d="M34 352h254l76-82h252l72 52h218l76-92h182" pathLength="1" />
        </g>
        <g className="v4-brand-field__nodes" fill="url(#experience-signal-gradient)">
          <circle cx="218" cy="310" r="5" />
          <circle cx="306" cy="188" r="7" />
          <circle cx="490" cy="188" r="5" />
          <circle cx="580" cy="256" r="7" />
          <circle cx="748" cy="256" r="5" />
          <circle cx="834" cy="114" r="7" />
          <circle cx="982" cy="230" r="5" />
        </g>
      </svg>
    </div>
  );
}

export function ResourceKnowledgeGraphic() {
  return (
    <div className="v4-brand-field v4-brand-field--resources" aria-hidden="true">
      <svg viewBox="0 0 760 560" role="presentation" focusable="false">
        <defs>
          <linearGradient id="resource-signal-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#735be7" />
            <stop offset="0.56" stopColor="#36b7c7" />
            <stop offset="1" stopColor="#8ae8c8" />
          </linearGradient>
        </defs>
        <g className="v4-brand-field__knowledge-lines">
          <path d="M103 365 226 236l132 66 116-168 170 86" />
          <path d="m103 365 143 90 112-153 142 112 144-194" />
          <path d="m226 236 20 219 254-41-26-280" />
        </g>
        <g className="v4-brand-field__knowledge-rings">
          <circle cx="358" cy="302" r="210" />
          <circle cx="358" cy="302" r="142" />
          <circle cx="358" cy="302" r="78" />
        </g>
        <g className="v4-brand-field__knowledge-nodes" fill="url(#resource-signal-gradient)">
          <circle cx="103" cy="365" r="7" />
          <circle cx="226" cy="236" r="6" />
          <circle cx="246" cy="455" r="5" />
          <circle cx="358" cy="302" r="9" />
          <circle cx="474" cy="134" r="6" />
          <circle cx="500" cy="414" r="7" />
          <circle cx="644" cy="220" r="6" />
        </g>
      </svg>
    </div>
  );
}

export function CommunityNetworkGraphic() {
  return (
    <div className="v4-community__network" aria-hidden="true">
      <svg viewBox="0 0 420 280" role="presentation" focusable="false">
        <defs>
          <linearGradient id="community-signal-gradient" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="#8ff0ee" />
            <stop offset="0.55" stopColor="#b8a8ff" />
            <stop offset="1" stopColor="#f2b486" />
          </linearGradient>
        </defs>
        <g className="v4-community__network-lines">
          <path d="m45 184 83-98 89 54 74-91 84 122" />
          <path d="m45 184 111 44 61-88 102 82 56-51" />
          <path d="m128 86 28 142 135-179 28 173" />
        </g>
        <g className="v4-community__network-nodes" fill="url(#community-signal-gradient)">
          <circle cx="45" cy="184" r="6" />
          <circle cx="128" cy="86" r="8" />
          <circle cx="156" cy="228" r="6" />
          <circle cx="217" cy="140" r="10" />
          <circle cx="291" cy="49" r="7" />
          <circle cx="319" cy="222" r="8" />
          <circle cx="375" cy="171" r="6" />
        </g>
      </svg>
    </div>
  );
}
