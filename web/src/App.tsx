import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { ChevronDown, ChevronLeft, ChevronRight, Copy, ExternalLink, Search, SlidersHorizontal, X } from "lucide-react";
import { Toaster, toast } from "sonner";
import { cn } from "./lib/utils";
import type { IndexEntry, ItemRecord } from "./types";

const RECENT_SEARCHES_KEY = "promptnest-recent-searches";
const CARD_GAP = 16;
const PAGE_SIZE = 30;
const SKELETON_CARD_COUNT = 12;

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit"
  }).format(date);
}

function formatDateTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return value;
  }

  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit"
  }).format(date);
}

function formatResolution(item: Pick<IndexEntry | ItemRecord, "resolution" | "width" | "height">) {
  if (item.resolution?.trim()) {
    return item.resolution.trim();
  }

  if (item.width && item.height) {
    return `${item.width}x${item.height}`;
  }

  return "2K";
}

function parseAspectRatio(entry: IndexEntry) {
  if (entry.ratio.includes(":")) {
    const [width, height] = entry.ratio.split(":").map(Number);
    if (width > 0 && height > 0) {
      return width / height;
    }
  }

  return 3 / 4;
}

function getColumnCount(width: number) {
  if (width >= 1440) return 5;
  if (width >= 1120) return 4;
  if (width >= 760) return 3;
  if (width >= 520) return 2;
  return 1;
}

function commitCopy(text: string, message: string) {
  void navigator.clipboard.writeText(text).then(
    () => toast.success(message),
    () => toast.error("复制失败")
  );
}

function getInitial(value: string) {
  return value.trim().slice(0, 1).toUpperCase() || "P";
}

function getSuggestions(entries: IndexEntry[], keyword: string) {
  const pool = new Set<string>();
  entries.forEach((entry) => {
    pool.add(entry.title);
    if (entry.model) pool.add(entry.model);
    entry.tags.forEach((tag) => pool.add(tag));
  });

  const all = Array.from(pool).filter(Boolean);
  if (!keyword) {
    return all.slice(0, 8);
  }

  return all.filter((item) => item.toLowerCase().includes(keyword)).slice(0, 8);
}

function ImageCard({
  item,
  onSelect
}: {
  item: IndexEntry;
  onSelect: (item: IndexEntry) => void;
}) {
  const [isHovered, setIsHovered] = useState(false);
  const hoverMeta = [item.model || "unknown model", item.ratio || "未知比例", formatResolution(item)].filter(Boolean);

  return (
    <motion.div
      layout
      transition={{ layout: { duration: 0.24, ease: "easeInOut" } }}
      whileTap={{ scale: 0.985 }}
      className="group relative w-full cursor-zoom-in"
      onMouseEnter={() => setIsHovered(true)}
      onMouseLeave={() => setIsHovered(false)}
      onClick={() => onSelect(item)}
    >
      <div
        className="dark-checkerboard relative overflow-hidden rounded-[24px] border border-white/6 bg-[#121720] shadow-[0_20px_60px_rgba(0,0,0,0.35)]"
        style={{ aspectRatio: parseAspectRatio(item) }}
      >
        <img
          src={item.image}
          alt={item.prompt || item.title}
          loading="lazy"
          className="h-full w-full object-cover object-top transition-transform duration-500 group-hover:scale-[1.03]"
        />

        <AnimatePresence>
          {isHovered ? (
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              className="absolute inset-0 flex flex-col justify-end bg-gradient-to-t from-black/70 via-black/14 to-transparent p-4"
            >
              <div className="card-hover-info">
                <div className="min-w-0">
                  <div className="truncate text-sm font-semibold text-white">{item.prompt}</div>
                  <div className="mt-1 truncate text-xs text-white/70">{hoverMeta.join(" · ")}</div>
                </div>
                <motion.button
                  whileTap={{ scale: 0.9 }}
                  onClick={(event) => {
                    event.stopPropagation();
                    commitCopy(item.prompt, "Prompt 已复制");
                  }}
                  className="card-copy-button"
                  type="button"
                  aria-label="复制提示词"
                >
                  <Copy className="h-4 w-4" />
                </motion.button>
              </div>
            </motion.div>
          ) : null}
        </AnimatePresence>
      </div>
    </motion.div>
  );
}

function GallerySkeleton() {
  return (
    <div className="asset-columns" style={{ gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))" }}>
      {Array.from({ length: SKELETON_CARD_COUNT }, (_, index) => (
        <div className="asset-skeleton-card" key={`skeleton-${index}`} style={{ aspectRatio: index % 3 === 0 ? "3 / 2" : "16 / 9" }} />
      ))}
    </div>
  );
}

function DetailView({
  item,
  onBack,
  onPrev,
  onNext,
  canPrev,
  canNext
}: {
  item: ItemRecord;
  onBack: () => void;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  canNext: boolean;
}) {
  const displayAuthor = item.author === "unknown" ? item.source || "PromptNest" : item.author;
  const collectedDate = formatDate(item.collectedAt || item.createdAt);
  const capturedDate = formatDateTime(item.capturedAt || item.createdAt);
  const promptMetaItems = [item.model, item.ratio, formatResolution(item)].filter(Boolean);
  const referenceImages = (item.referenceImages ?? []).filter((referenceImage) => referenceImage.image);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      className="promptnest-detail-modal"
    >
      <div className="container-kvmiPn">
        <section className="preview-area-TnDJHN">
          <div className="preview-area-QscVpt">
            <div className="context-menu-trigger-container-w5xaCZ">
              <div className="image-left-content-myH1iF">
                <div className="image-player-KCJSe1">
                  <div className="image-player-container-V9ZRXE">
                    <div className="image-player-content-Ml9sbe">
                      <motion.div
                        initial={{ opacity: 0, scale: 0.985, y: 10 }}
                        animate={{ opacity: 1, scale: 1, y: 0 }}
                        transition={{ duration: 0.32, ease: "easeOut" }}
                        className="container-bbbsvQ image-player-image-_Tib2c"
                      >
                        <img src={item.image} alt={item.title} className="image-eTuIBd" />
                      </motion.div>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>

          <div className="detail-nav-controls">
            <button aria-label="上一个" disabled={!canPrev} onClick={onPrev} type="button">
              <ChevronLeft />
            </button>
            <button aria-label="下一个" disabled={!canNext} onClick={onNext} type="button">
              <ChevronRight />
            </button>
          </div>
        </section>

        <div className="operation-area-EihPQ7 middle-content-xyawTY">
          <motion.button
            whileTap={{ scale: 0.92 }}
            onClick={onBack}
            className="operation-icon-w5Y4Pg close-button-PTpYOA"
            type="button"
            aria-label="关闭"
          >
            <X />
          </motion.button>
        </div>

        <aside className="detail-area-mylLyv">
          <motion.div
            initial={{ opacity: 0, x: 18 }}
            animate={{ opacity: 1, x: 0 }}
            transition={{ duration: 0.32, ease: "easeOut", delay: 0.06 }}
            className="main-container-MeJEJY"
          >
            <div className="content-wrapper-yGrcJJ">
              <div className="user-profile-container-YpAS0A">
                <div className="left-container-vYu9RS">
                  <div className="user-section-O05SIg">
                    <div className="user-avatar-gP6jYP">
                      <span className="avatar-image-Xos7qj">{getInitial(displayAuthor)}</span>
                    </div>
                    <div className="user-name-UPyK2X">{displayAuthor}</div>
                  </div>
                </div>
              </div>

              <div className="work-info-section-kNeD31">
                <div className="meta-info-wrapper-xhHsPv">
                  <div className="create-time-wrapper-fqUhx0">{collectedDate}</div>
                  <span className="meta-divider-lB0vke" aria-hidden="true" />
                  <div className="ai-generated-text-IHOsIL">内容由 AI 生成</div>
                </div>
              </div>

              <div className="detail-info-n1sIVT">
                <div className="prompt-tip-_S_YjR">图片提示词</div>
                <div className="prompt-value-H7u3lm">
                  <div className="prompt-value-text-cJL62n">
                    <span className="prompt-value-container-lIP4pF">
                      <span>{item.prompt}</span>
                    </span>
                  </div>
                </div>
                <div className="prompt-tags-Ixl0vJ">
                  {referenceImages.map((referenceImage, index) => {
                    const referenceLabel = referenceImage.label || "智能参考";

                    return (
                      <span className="prompt-reference-group" key={`${referenceImage.image}-${index}`}>
                        {index > 0 ? <span className="divider-RsIwo2" /> : null}
                        <span className="prompt-reference-tag" tabIndex={0}>
                          <span className="container-nSiKjY">
                            <span className="img-container-vz7x9s">
                              <img
                                src={referenceImage.thumbnail || referenceImage.image}
                                alt={referenceLabel}
                                draggable={false}
                              />
                            </span>
                            <span className="text-G89IWO">{referenceLabel}</span>
                          </span>
                          <span className="reference-preview-popover" aria-hidden="true">
                            <span className="reference-preview-title">{referenceLabel}</span>
                            <span className="reference-preview-image-frame">
                              <img src={referenceImage.image} alt="" draggable={false} />
                            </span>
                          </span>
                        </span>
                      </span>
                    );
                  })}
                  {referenceImages.length > 0 && promptMetaItems.length > 0 ? <span className="divider-RsIwo2" /> : null}
                  {promptMetaItems.map((meta, index) => (
                    <span className="prompt-tag-item" key={`${meta}-${index}`}>
                      {index > 0 ? <span className="divider-RsIwo2" /> : null}
                      <span>{meta}</span>
                    </span>
                  ))}
                </div>
              </div>

              <div className="action-buttons-wrapper-ibCKz2">
                <button className="operation-button-ZGVDtf" onClick={() => commitCopy(item.prompt, "Prompt 已复制")} type="button">
                  <Copy className="operation-icon-cJWKaj" />
                  <p className="operation-text-sYthqa">复制提示词</p>
                </button>
                <a className="operation-button-ZGVDtf" href={item.sourceUrl} rel="noreferrer" target="_blank">
                  <ExternalLink className="operation-icon-cJWKaj" />
                  <p className="operation-text-sYthqa">查看来源</p>
                </a>
              </div>

              <div className="detail-captured-time-A1b2c3">采集时间 {capturedDate}</div>
            </div>
          </motion.div>
        </aside>
      </div>
    </motion.div>
  );
}

export function App() {
  const [entries, setEntries] = useState<IndexEntry[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [selectedItem, setSelectedItem] = useState<ItemRecord | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const deferredSearchQuery = useDeferredValue(searchQuery);
  const [isSearchFocused, setIsSearchFocused] = useState(false);
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  const [modelFilter, setModelFilter] = useState("all");
  const [ratioFilter, setRatioFilter] = useState("all");
  const [isFilterOpen, setIsFilterOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [visibleCount, setVisibleCount] = useState(PAGE_SIZE);
  const [message, setMessage] = useState("正在加载内容...");
  const galleryRef = useRef<HTMLDivElement | null>(null);
  const loadMoreRef = useRef<HTMLDivElement | null>(null);
  const filterPanelRef = useRef<HTMLDivElement | null>(null);
  const [galleryWidth, setGalleryWidth] = useState(1280);

  useEffect(() => {
    void (async () => {
      try {
        const response = await fetch("/data/index.json");
        const data = (await response.json()) as IndexEntry[];
        setEntries(data);

        if (data.length === 0) {
          setMessage("还没有内容，先通过插件提交第一条 Prompt。");
        }
      } catch {
        setMessage("内容加载失败，请检查 data/index.json。");
      } finally {
        setIsLoading(false);
      }
    })();
  }, []);

  useEffect(() => {
    if (!selectedId) {
      setSelectedItem(null);
      document.body.style.overflow = "";
      return;
    }

    document.body.style.overflow = "hidden";

    void (async () => {
      const response = await fetch(`/data/items/${selectedId}.json`);
      const data = (await response.json()) as ItemRecord;
      setSelectedItem(data);
    })();

    return () => {
      document.body.style.overflow = "";
    };
  }, [selectedId]);

  useEffect(() => {
    const element = galleryRef.current;
    if (!element) return;

    const updateWidth = (width?: number) => {
      const nextWidth = Math.max(320, Math.round(width ?? element.getBoundingClientRect().width));
      setGalleryWidth((current) => (current === nextWidth ? current : nextWidth));
    };

    updateWidth();
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateWidth(entry.contentRect.width);
      }
    });

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    try {
      const cached = window.localStorage.getItem(RECENT_SEARCHES_KEY);
      if (!cached) return;
      const parsed = JSON.parse(cached);
      if (Array.isArray(parsed)) {
        setRecentSearches(parsed.filter((item): item is string => typeof item === "string").slice(0, 12));
      }
    } catch {
      // Ignore localStorage parse failures.
    }
  }, []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setIsFilterOpen(false);
        setSelectedId(null);
      }
    };

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  useEffect(() => {
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || filterPanelRef.current?.contains(target)) {
        return;
      }

      setIsFilterOpen(false);
    };

    window.addEventListener("pointerdown", onPointerDown);
    return () => window.removeEventListener("pointerdown", onPointerDown);
  }, []);

  const modelOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.model).filter(Boolean))).sort(), [entries]);
  const ratioOptions = useMemo(() => Array.from(new Set(entries.map((entry) => entry.ratio).filter(Boolean))).sort(), [entries]);

  const filteredEntries = useMemo(() => {
    const keyword = deferredSearchQuery.trim().toLowerCase();

    return entries.filter((entry) => {
      const matchesQuery =
        keyword.length === 0 ||
        entry.title.toLowerCase().includes(keyword) ||
        entry.prompt.toLowerCase().includes(keyword) ||
        entry.model.toLowerCase().includes(keyword) ||
        entry.tags.some((tag) => tag.toLowerCase().includes(keyword));

      const matchesModel = modelFilter === "all" || entry.model === modelFilter;
      const matchesRatio = ratioFilter === "all" || entry.ratio === ratioFilter;

      return matchesQuery && matchesModel && matchesRatio;
    });
  }, [deferredSearchQuery, entries, modelFilter, ratioFilter]);

  useEffect(() => {
    setVisibleCount(PAGE_SIZE);
  }, [deferredSearchQuery, modelFilter, ratioFilter]);

  useEffect(() => {
    const element = loadMoreRef.current;
    if (!element || visibleCount >= filteredEntries.length) {
      return;
    }

    const observer = new IntersectionObserver(
      (observerEntries) => {
        if (observerEntries.some((entry) => entry.isIntersecting)) {
          setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredEntries.length));
        }
      },
      { rootMargin: "640px 0px" }
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, [filteredEntries.length, visibleCount]);

  const suggestions = useMemo(() => {
    return getSuggestions(entries, deferredSearchQuery.trim().toLowerCase());
  }, [deferredSearchQuery, entries]);

  const columnCount = useMemo(() => getColumnCount(galleryWidth), [galleryWidth]);
  const visibleEntries = useMemo(() => filteredEntries.slice(0, visibleCount), [filteredEntries, visibleCount]);
  const hasActiveFilters = modelFilter !== "all" || ratioFilter !== "all";
  const emptyMessage = entries.length === 0 ? message : "没有匹配的条目。";

  const masonryColumns = useMemo(() => {
    const columns = Array.from({ length: columnCount }, () => [] as IndexEntry[]);
    const heights = Array.from({ length: columnCount }, () => 0);

    visibleEntries.forEach((entry) => {
      const aspectRatio = parseAspectRatio(entry);
      const estimatedHeight = 100 / Math.max(aspectRatio, 0.25) + CARD_GAP;
      const targetColumn = heights.indexOf(Math.min(...heights));
      columns[targetColumn].push(entry);
      heights[targetColumn] += estimatedHeight;
    });

    return columns;
  }, [columnCount, visibleEntries]);

  const selectedIndex = selectedId ? filteredEntries.findIndex((entry) => entry.id === selectedId) : -1;

  const commitRecentSearch = (keyword: string) => {
    const trimmed = keyword.trim();
    if (!trimmed) return;

    setRecentSearches((current) => {
      const next = [trimmed, ...current.filter((item) => item !== trimmed)].slice(0, 12);
      try {
        window.localStorage.setItem(RECENT_SEARCHES_KEY, JSON.stringify(next));
      } catch {
        // Ignore localStorage write failures.
      }
      return next;
    });
  };

  const handleSelect = (item: IndexEntry) => {
    setSelectedId(item.id);
  };

  const handleOpenRelative = (offset: number) => {
    if (selectedIndex < 0) return;
    const nextEntry = filteredEntries[selectedIndex + offset];
    if (!nextEntry) return;
    setSelectedId(nextEntry.id);
  };

  return (
    <div className="min-h-screen overflow-x-hidden bg-transparent text-white">
      <Toaster
        position="top-center"
        richColors
        duration={1800}
        toastOptions={{
          style: {
            width: "fit-content",
            minWidth: "fit-content",
            margin: "0 auto",
            justifyContent: "center"
          }
        }}
      />

      <main className="home-page-shell mx-auto min-h-screen w-full max-w-[1560px] px-4 md:px-6">
        <div className="home-toolbar">
          <header className="home-toolbar-row">
            <div className="home-search-shell group">
              <div className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-white/35 transition-colors group-focus-within:text-white/70">
                <Search className="h-5 w-5" />
              </div>
              <input
                type="text"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    commitRecentSearch(searchQuery);
                    setIsSearchFocused(false);
                  }
                }}
                onFocus={() => setIsSearchFocused(true)}
                onBlur={() => setTimeout(() => setIsSearchFocused(false), 200)}
                placeholder="搜索标题 / Prompt / 标签 / 模型"
                className="home-search-input"
              />
              {searchQuery ? (
                <motion.button
                  whileTap={{ scale: 0.85 }}
                  onClick={() => setSearchQuery("")}
                  className="home-search-clear"
                  type="button"
                  aria-label="清空搜索"
                >
                  <X className="h-5 w-5" />
                </motion.button>
              ) : null}

              <AnimatePresence>
                {isSearchFocused && (suggestions.length > 0 || recentSearches.length > 0) ? (
                  <motion.div
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    className="search-suggestion-panel"
                  >
                    {recentSearches.length > 0 ? (
                      <div className="px-6">
                        <div className="text-[15px] font-medium text-white/35">最近搜索</div>
                        <div className="mt-4 flex flex-wrap gap-3">
                          {recentSearches.map((item) => (
                            <button
                              type="button"
                              key={item}
                              onClick={() => {
                                setSearchQuery(item);
                                commitRecentSearch(item);
                                setIsSearchFocused(false);
                              }}
                              className="recent-search-chip"
                            >
                              {item}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}

                    {suggestions.length > 0 ? (
                      <>
                        {recentSearches.length > 0 ? <div className="mx-6 my-3 h-px bg-white/6" /> : null}
                        <div className="px-3">
                          {suggestions.map((item, index) => (
                            <motion.button
                              whileTap={{ scale: 0.98 }}
                              type="button"
                              key={`${item}-${index}`}
                              onClick={() => {
                                setSearchQuery(item);
                                commitRecentSearch(item);
                                setIsSearchFocused(false);
                              }}
                              className="search-suggestion-item"
                            >
                              <span className="font-medium text-white/35">
                                {searchQuery.trim() ? searchQuery : ""}
                              </span>
                              <span className="font-bold text-white">
                                {searchQuery.trim() ? item.replace(searchQuery, "") || item : item}
                              </span>
                            </motion.button>
                          ))}
                        </div>
                      </>
                    ) : null}
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>

            <div className="filter-shell" ref={filterPanelRef}>
              <motion.button
                whileTap={{ scale: 0.98 }}
                className={cn("filter-trigger", hasActiveFilters && "is-active")}
                onClick={() => setIsFilterOpen((current) => !current)}
                type="button"
                aria-expanded={isFilterOpen}
              >
                <SlidersHorizontal className="h-4 w-4" />
                <span>筛选</span>
                <ChevronDown className={cn("h-4 w-4 transition-transform", isFilterOpen && "rotate-180")} />
              </motion.button>

              <AnimatePresence>
                {isFilterOpen ? (
                  <motion.div
                    initial={{ opacity: 0, y: -8, scale: 0.98 }}
                    animate={{ opacity: 1, y: 0, scale: 1 }}
                    exit={{ opacity: 0, y: -8, scale: 0.98 }}
                    transition={{ duration: 0.18, ease: "easeOut" }}
                    className="filter-popover"
                  >
                    <div className="filter-popover-head">
                      <span>筛选条件</span>
                      {hasActiveFilters ? (
                        <button
                          type="button"
                          onClick={() => {
                            setModelFilter("all");
                            setRatioFilter("all");
                          }}
                        >
                          重置
                        </button>
                      ) : null}
                    </div>

                    <div className="filter-group">
                      <div className="filter-group-title">模型</div>
                      <div className="filter-button-row">
                        {[["all", "全部模型"], ...modelOptions.map((model) => [model, model])].map(([value, label]) => (
                          <button
                            className={cn("filter-pill-option", modelFilter === value && "is-selected")}
                            key={`model-${value}`}
                            onClick={() => setModelFilter(value)}
                            type="button"
                          >
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>

                    <div className="filter-group">
                      <div className="filter-group-title">比例</div>
                      <div className="filter-button-row">
                        {[["all", "全部比例"], ...ratioOptions.map((ratio) => [ratio, ratio])].map(([value, label]) => (
                          <button
                            className={cn("filter-pill-option", ratioFilter === value && "is-selected")}
                            key={`ratio-${value}`}
                            onClick={() => setRatioFilter(value)}
                            type="button"
                          >
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                    </div>
                  </motion.div>
                ) : null}
              </AnimatePresence>
            </div>
          </header>

          <div className="home-count-row">
            <span>当前显示 {isLoading ? 0 : Math.min(visibleEntries.length, filteredEntries.length)} / {filteredEntries.length} 个条目</span>
            {hasActiveFilters ? (
              <button
                type="button"
                onClick={() => {
                  setModelFilter("all");
                  setRatioFilter("all");
                }}
              >
                清除筛选
              </button>
            ) : null}
          </div>
        </div>

        <div className="pb-10" ref={galleryRef}>
          {isLoading ? (
            <GallerySkeleton />
          ) : filteredEntries.length === 0 ? (
            <div className="py-20 text-center text-white/35">{emptyMessage}</div>
          ) : (
            <>
              <div
                className="asset-columns"
                style={{ gridTemplateColumns: `repeat(${columnCount}, minmax(0, 1fr))` }}
              >
                {masonryColumns.map((column, columnIndex) => (
                  <div key={`column-${columnIndex}`} className="asset-column">
                    {column.map((item) => (
                      <ImageCard key={item.id} item={item} onSelect={handleSelect} />
                    ))}
                  </div>
                ))}
              </div>
              {visibleEntries.length < filteredEntries.length ? (
                <div className="load-more-sentinel" ref={loadMoreRef}>
                  <button
                    type="button"
                    onClick={() => setVisibleCount((current) => Math.min(current + PAGE_SIZE, filteredEntries.length))}
                  >
                    加载更多
                  </button>
                </div>
              ) : null}
            </>
          )}
        </div>
      </main>

      <AnimatePresence>
        {selectedItem ? (
          <DetailView
            item={selectedItem}
            onBack={() => setSelectedId(null)}
            onPrev={() => handleOpenRelative(-1)}
            onNext={() => handleOpenRelative(1)}
            canPrev={selectedIndex > 0}
            canNext={selectedIndex !== -1 && selectedIndex < filteredEntries.length - 1}
          />
        ) : null}
      </AnimatePresence>
    </div>
  );
}
