import { CURRENCY } from "@/config/brand";
import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { MATERIALS, OCCASIONS, brand } from "@/config/brand";
import { useAdminCategoryNames } from "@/lib/use-categories";
import {
  adminCollectionsQuery,
  slugIsFree,
  slugify,
  type AdminProduct,
} from "@/lib/admin";
import { uploadProductImage, validateImageFile } from "@/lib/storage";
import { ChooseFromMedia, MediaPicker } from "@/components/admin/MediaPicker";
import { TagInput } from "@/components/admin/TagInput";
import { VideoPicker } from "@/components/admin/VideoPicker";
import { saveProduct } from "@/lib/product-save.functions";
import { VariantsEditor, draftsToPayload, toDraft, type VariantDraft } from "@/components/admin/VariantsEditor";
import type { ProductOption } from "@/lib/variants";

type ImageDraft = {
  id?: string;
  image_url: string;
  alt_text: string;
};

export function ProductForm({ product }: { product?: AdminProduct }) {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const { data: collections } = useQuery(adminCollectionsQuery());

  const [name, setName] = useState(product?.name ?? "");
  const [slug, setSlug] = useState(product?.slug ?? "");
  const [sku, setSku] = useState(product?.sku ?? "");
  // A stored price of 0 or an empty material means "not filled in yet"
  // (products can be imported before pricing and photos are ready).
  const [price, setPrice] = useState(
    product && Number(product.price) > 0 ? String(product.price) : "",
  );
  // Optional selling fields: blank stock = not tracked, blank compare-at = no sale price.
  const [stock, setStock] = useState(product?.stock_quantity != null ? String(product.stock_quantity) : "");
  const [compareAt, setCompareAt] = useState(product?.compare_at_price ? String(product.compare_at_price) : "");
  // Options (Size, Colour…) and the variants generated from them.
  const [options, setOptions] = useState<ProductOption[]>(product?.options ?? []);
  const [variants, setVariants] = useState<VariantDraft[]>((product?.product_variants ?? []).map(toDraft));
  const [category, setCategory] = useState(product?.category ?? "");
  const { names: categoryNames, loading: categoriesLoading } = useAdminCategoryNames(product?.category);
  // A new product starts on the first category in the list once it has loaded.
  useEffect(() => {
    if (!category && !categoriesLoading && categoryNames[0]) setCategory(categoryNames[0]);
  }, [category, categoriesLoading, categoryNames]);
  const [subcategory, setSubcategory] = useState(product?.subcategory ?? "");
  const [material, setMaterial] = useState(product?.material ?? MATERIALS[0]);
  const [description, setDescription] = useState(product?.description ?? "");
  const [whereToWear, setWhereToWear] = useState(product?.where_to_wear ?? "");
  const [occasions, setOccasions] = useState<string[]>(product?.occasion ?? []);
  const [tags, setTags] = useState<string[]>(product?.tags ?? []);
  const [videoUrl, setVideoUrl] = useState(product?.video_url ?? "");
  const [weight, setWeight] = useState(product?.weight_grams ? String(product.weight_grams) : "");
  const [dimL, setDimL] = useState(product?.length_cm ? String(product.length_cm) : "");
  const [dimB, setDimB] = useState(product?.breadth_cm ? String(product.breadth_cm) : "");
  const [dimH, setDimH] = useState(product?.height_cm ? String(product.height_cm) : "");
  const [featured, setFeatured] = useState(product?.featured ?? false);
  const [newArrival, setNewArrival] = useState(product?.new_arrival ?? false);
  const [published, setPublished] = useState(product?.published ?? false);
  const [seoTitle, setSeoTitle] = useState(product?.seo_title ?? "");
  const [seoDescription, setSeoDescription] = useState(product?.seo_description ?? "");
  const [seoImageUrl, setSeoImageUrl] = useState(product?.seo_image_url ?? "");
  const [images, setImages] = useState<ImageDraft[]>(
    (product?.product_images ?? []).map((i) => ({
      id: i.id,
      image_url: i.image_url,
      alt_text: i.alt_text ?? "",
    })),
  );
  const [errors, setErrors] = useState<string[]>([]);
  const [busy, setBusy] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [pickingImages, setPickingImages] = useState(false);
  // Removed images stay staged here until the product is actually saved, so
  // closing the tab or a failed save never loses the stored image.
  const [removedImages, setRemovedImages] = useState<ImageDraft[]>([]);

  function applyCollection(slugValue: string) {
    const c = (collections ?? []).find((x: any) => x.slug === slugValue);
    if (!c) return;
    setSubcategory(c.name);
    if (c.category_filter) setCategory(c.category_filter);
    if (c.material_filter) setMaterial(c.material_filter);
  }

  async function handleFiles(fileList: FileList | null) {
    if (!fileList?.length) return;
    setUploading(true);
    try {
      for (const file of Array.from(fileList)) {
        const invalid = validateImageFile(file);
        if (invalid) {
          toast.error(invalid);
          continue;
        }
        const url = await uploadProductImage(file);
        setImages((prev) => [...prev, { image_url: url, alt_text: "" }]);
      }
    } catch {
      toast.error("Upload failed. Please try again.");
    } finally {
      setUploading(false);
    }
  }

  function move(index: number, delta: number) {
    setImages((prev) => {
      const next = [...prev];
      const target = index + delta;
      if (target < 0 || target >= next.length) return prev;
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }

  function removeImage(index: number) {
    const image = images[index]!;
    setImages((prev) => prev.filter((_, i) => i !== index));
    // Only stage the removal — the database row and the stored file are
    // deleted after the product saves successfully.
    setRemovedImages((prev) => [...prev, image]);
  }

  async function validate(): Promise<string[]> {
    const list: string[] = [];
    if (!name.trim()) list.push("Product name is required.");
    const priceValue = Number(price);
    if (!price.trim() || !Number.isFinite(priceValue) || priceValue <= 0)
      list.push("Please enter a valid sale price greater than zero.");
    if (compareAt.trim() !== "" && !(Number(compareAt) > priceValue))
      list.push("The MRP must be higher than the sale price, or leave it empty.");
    if (!categoryNames.includes(category))
      list.push("Please choose a valid category.");
    if (!MATERIALS.includes(material as (typeof MATERIALS)[number]))
      list.push("Please choose a valid material.");
    const finalSlug = (slug.trim() || slugify(name)).toLowerCase();
    if (!finalSlug) list.push("Please provide a web address (slug).");
    else if (!(await slugIsFree(finalSlug, product?.id)))
      list.push("That web address (slug) is already used by another product.");
    return list;
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (uploading) {
      setErrors(["Please wait for the image upload to finish before saving."]);
      return;
    }
    setBusy(true);
    const found = await validate();
    setErrors(found);
    if (found.length) {
      setBusy(false);
      return;
    }

    const finalSlug = (slug.trim() || slugify(name)).toLowerCase();

    try {
      // One atomic save: product row, slug redirect and image rows are
      // written together, and staged image removals are applied only on
      // success.
      await saveProduct({
        data: {
          id: product?.id,
          previousSlug: product?.slug,
          payload: {
            name: name.trim(),
            slug: finalSlug,
            sku: sku.trim(),
            price: Number(price),
            options: options.filter((o) => o.name.trim() || o.values.length),
            stock_quantity: stock.trim() === "" ? null : Math.max(0, Math.trunc(Number(stock)) || 0),
            compare_at_price: compareAt.trim() === "" ? null : Number(compareAt) || null,
            category,
            subcategory: subcategory.trim() || null,
            material,
            description: description.trim() || null,
            where_to_wear: whereToWear.trim() || null,
            occasion: occasions,
            tags,
            video_url: videoUrl || null,
            weight_grams: weight.trim() === "" ? null : Math.max(0, Math.trunc(Number(weight)) || 0) || null,
            length_cm: dimL.trim() === "" ? null : Number(dimL) || null,
            breadth_cm: dimB.trim() === "" ? null : Number(dimB) || null,
            height_cm: dimH.trim() === "" ? null : Number(dimH) || null,
            featured,
            new_arrival: newArrival,
            published,
            seo_title: seoTitle.trim() || null,
            seo_description: seoDescription.trim() || null,
            seo_image_url: seoImageUrl.trim() || null,
          },
          images,
          removedImages,
          variants: draftsToPayload(variants),
        },
      });

      void qc.invalidateQueries({ queryKey: ["admin"] });
      void qc.invalidateQueries({ queryKey: ["products"] });
      void qc.invalidateQueries({ queryKey: ["product"] });
      toast.success(product ? "Product updated" : "Product created");
      navigate({ to: "/admin/products" });
    } catch (error) {
      setErrors([
        error instanceof Error && error.message
          ? error.message
          : "Something went wrong. Please try again.",
      ]);
    } finally {
      setBusy(false);
    }
  }

  const field =
    "mt-2 w-full border border-border bg-background px-3 py-2.5 text-sm focus:border-brand-red focus:outline-none";

  return (
    <form onSubmit={onSubmit} className="max-w-4xl space-y-8" noValidate>
      {errors.length ? (
        <div role="alert" className="border border-brand-red bg-background p-4 text-sm">
          <ul className="list-inside list-disc space-y-1 text-brand-red">
            {errors.map((e) => (
              <li key={e}>{e}</li>
            ))}
          </ul>
        </div>
      ) : null}

      <fieldset className="grid gap-4 border border-border bg-background p-5 sm:grid-cols-2">
        <legend className="eyebrow px-2">Product details</legend>
        <label className="block text-sm">
          Product name *
          <input
            value={name}
            onChange={(e) => {
              setName(e.target.value);
              if (!product && !slug) setSlug(slugify(e.target.value));
            }}
            required
            className={field}
          />
        </label>
        <label className="block text-sm">
          SKU (the barcode text)
          <input
            value={sku}
            onChange={(e) => setSku(e.target.value)}
            placeholder="Leave empty to make one from the category, like ER-0001"
            className={field}
          />
        </label>
        <label className="block text-sm">
          Web address (slug)
          <input
            value={slug}
            onChange={(e) => setSlug(slugify(e.target.value))}
            className={field}
          />
        </label>
        <label className="block text-sm">
          Sale price ({CURRENCY}) * <span className="font-normal text-muted-foreground">— what the customer pays</span>
          <input
            value={price}
            onChange={(e) => setPrice(e.target.value)}
            inputMode="decimal"
            required
            className={field}
          />
        </label>
        <label className="block text-sm">
          MRP ({CURRENCY}) <span className="font-normal text-muted-foreground">— the original price</span>
          <input
            value={compareAt}
            onChange={(e) => setCompareAt(e.target.value)}
            inputMode="decimal"
            placeholder="Optional — the real MRP, higher than the sale price"
            className={field}
          />
          {(() => {
            const pct = compareAt.trim() !== "" && Number(price) > 0 ? Math.round(((Number(compareAt) - Number(price)) / Number(compareAt)) * 100) : null;
            return pct !== null && pct >= 1 ? (
              <span className="mt-1 block text-xs font-medium text-emerald-700">Shoppers will see {pct}% OFF and the MRP struck through.</span>
            ) : (
              <span className="mt-1 block text-xs text-muted-foreground">Leave empty for no discount badge. Enter your genuine MRP only.</span>
            );
          })()}
        </label>
        <label className="block text-sm">
          Available quantity
          <input
            value={stock}
            onChange={(e) => setStock(e.target.value.replace(/[^0-9]/g, ""))}
            inputMode="numeric"
            placeholder="Leave blank to not track stock"
            className={field}
          />
        </label>
        <label className="block text-sm">
          Category *
          <select
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            className={field}
          >
            {categoryNames.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Material *
          <select
            value={material}
            onChange={(e) => setMaterial(e.target.value)}
            className={field}
          >
            {material ? null : <option value="">Choose a material…</option>}
            {MATERIALS.map((m) => (
              <option key={m} value={m}>
                {m}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Collection (fills category, material and subcategory)
          <select
            defaultValue=""
            onChange={(e) => applyCollection(e.target.value)}
            className={field}
          >
            <option value="">Choose a collection…</option>
            {(collections ?? []).map((c: any) => (
              <option key={c.id} value={c.slug}>
                {c.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block text-sm">
          Subcategory
          <input
            value={subcategory}
            onChange={(e) => setSubcategory(e.target.value)}
            className={field}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Description
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            rows={4}
            className={field}
          />
        </label>
        <label className="block text-sm sm:col-span-2">
          Where to wear
          <input
            value={whereToWear}
            onChange={(e) => setWhereToWear(e.target.value)}
            className={field}
          />
        </label>
      </fieldset>

      <fieldset className="border border-border bg-background p-5">
        <legend className="eyebrow px-2">Occasions</legend>
        <div className="flex flex-wrap gap-3">
          {OCCASIONS.map((o) => (
            <label key={o} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={occasions.includes(o)}
                onChange={(e) =>
                  setOccasions((prev) =>
                    e.target.checked ? [...prev, o] : prev.filter((x) => x !== o),
                  )
                }
              />
              {o}
            </label>
          ))}
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border border-border bg-background p-5 sm:grid-cols-4">
        <legend className="eyebrow px-2">Shipping (parcel)</legend>
        <p className="text-xs text-muted-foreground sm:col-span-4">The packed weight and size of one piece, used to price and book the courier in Shiprocket. Leave blank to use the default parcel set in Integrations → Shiprocket.</p>
        <label className="text-sm">Weight (grams)<input inputMode="numeric" value={weight} onChange={(e) => setWeight(e.target.value.replace(/\D/g, ""))} placeholder="e.g. 120" className={field} /></label>
        <label className="text-sm">Length (cm)<input inputMode="decimal" value={dimL} onChange={(e) => setDimL(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 10" className={field} /></label>
        <label className="text-sm">Breadth (cm)<input inputMode="decimal" value={dimB} onChange={(e) => setDimB(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 8" className={field} /></label>
        <label className="text-sm">Height (cm)<input inputMode="decimal" value={dimH} onChange={(e) => setDimH(e.target.value.replace(/[^\d.]/g, ""))} placeholder="e.g. 3" className={field} /></label>
      </fieldset>

      <fieldset className="border border-border bg-background p-5">
        <legend className="eyebrow px-2">Tags</legend>
        <p className="mb-2 text-xs text-muted-foreground">Labels such as “sale” or “summer-offer”. Use them to start a sale: create a discount that applies to a tag.</p>
        <TagInput value={tags} onChange={setTags} />
      </fieldset>

      <fieldset className="border border-border bg-background p-5">
        <legend className="eyebrow px-2">Visibility</legend>
        <div className="flex flex-wrap gap-5 text-sm">
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={published}
              onChange={(e) => setPublished(e.target.checked)}
            />
            Published (visible on the website)
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={featured}
              onChange={(e) => setFeatured(e.target.checked)}
            />
            Featured
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={newArrival}
              onChange={(e) => setNewArrival(e.target.checked)}
            />
            New arrival
          </label>
        </div>
      </fieldset>

      <fieldset className="grid gap-4 border border-border bg-background p-5 sm:grid-cols-2">
        <legend className="eyebrow px-2">Search & social</legend>
        <p className="text-xs text-muted-foreground sm:col-span-2">Optional. Leave blank to automatically use the product name, description and primary image.</p>
        <label className="text-sm">SEO title<input value={seoTitle} onChange={(e) => setSeoTitle(e.target.value)} maxLength={60} className={field} /></label>
        <div className="text-sm"><label>Social image URL<input value={seoImageUrl} onChange={(e) => setSeoImageUrl(e.target.value)} placeholder="https://…" className={field} /></label><ChooseFromMedia onPick={setSeoImageUrl} /></div>
        <label className="text-sm sm:col-span-2">SEO description<textarea value={seoDescription} onChange={(e) => setSeoDescription(e.target.value)} maxLength={158} rows={3} className={field} /></label>
      </fieldset>

      <fieldset className="border border-border bg-background p-5">
        <legend className="eyebrow px-2">Product video</legend>
        <p className="mb-3 text-xs text-muted-foreground">An optional video shown with the photos on the product page. It always plays without sound. A video for each variation (for example each colour) can be added in the variants table below.</p>
        <VideoPicker label="Product video" value={videoUrl} onChange={setVideoUrl} />
      </fieldset>

      <VariantsEditor
        options={options}
        variants={variants}
        onChange={(next) => {
          setOptions(next.options);
          setVariants(next.variants);
        }}
        images={images.map((i) => i.image_url)}
        basePrice={price}
      />

      <fieldset className="border border-border bg-background p-5">
        <legend className="eyebrow px-2">Images</legend>
        <p className="text-xs text-muted-foreground">
          The first image is the primary product image. JPG, PNG, WebP or AVIF up
          to 8 MB — images are converted to WebP and resized before upload.
        </p>
        <input
          type="file"
          accept="image/jpeg,image/png,image/webp,image/avif"
          multiple
          onChange={(e) => void handleFiles(e.target.files)}
          className="mt-4 block text-sm"
          aria-label="Upload product images"
        />
        <button type="button" onClick={() => setPickingImages(true)} className="mt-3 inline-flex items-center rounded-lg border border-[#c9c9c9] bg-white px-3 py-1.5 text-[13px] font-semibold text-[#303030] hover:bg-[#f7f7f7]">Choose from Media</button>
        {pickingImages ? (
          <MediaPicker
            multiple
            title="Choose product photos"
            onClose={() => setPickingImages(false)}
            onPick={(urls) => {
              setPickingImages(false);
              setImages((prev) => [...prev, ...urls.filter((u) => !prev.some((p) => p.image_url === u)).map((u) => ({ image_url: u, alt_text: "" }))]);
            }}
          />
        ) : null}
        {uploading ? (
          <p className="mt-2 text-xs text-muted-foreground">Uploading…</p>
        ) : null}

        <ul className="mt-5 space-y-3">
          {images.map((image, index) => (
            <li
              key={image.image_url}
              className="flex flex-wrap items-center gap-3 border border-border p-3"
            >
              <img
                src={image.image_url}
                alt=""
                width={56}
                height={70}
                className="h-[70px] w-14 object-cover"
              />
              <label className="min-w-0 flex-1 text-xs">
                Alt text
                <input
                  value={image.alt_text}
                  onChange={(e) =>
                    setImages((prev) =>
                      prev.map((x, i) =>
                        i === index ? { ...x, alt_text: e.target.value } : x,
                      ),
                    )
                  }
                  placeholder={`${brand.name} ${material} ${category.toLowerCase()}`}
                  className="mt-1 w-full border border-border px-2 py-1.5 text-sm"
                />
              </label>
              <span className="text-xs text-muted-foreground">
                {index === 0 ? "Primary" : `#${index + 1}`}
              </span>
              <div className="flex gap-2 text-xs">
                <button
                  type="button"
                  onClick={() => move(index, -1)}
                  className="border border-border px-2 py-1"
                  aria-label="Move image up"
                >
                  ↑
                </button>
                <button
                  type="button"
                  onClick={() => move(index, 1)}
                  className="border border-border px-2 py-1"
                  aria-label="Move image down"
                >
                  ↓
                </button>
                <button
                  type="button"
                  onClick={() => void removeImage(index)}
                  className="border border-border px-2 py-1 hover:border-brand-red hover:text-brand-red"
                >
                  Remove
                </button>
              </div>
            </li>
          ))}
        </ul>
      </fieldset>

      <div className="flex flex-wrap gap-3">
        <button
          type="submit"
          disabled={busy || uploading}
          className="eyebrow bg-foreground px-6 py-4 text-background hover:bg-brand-red disabled:opacity-60"
        >
          {busy ? "Saving…" : product ? "Save changes" : "Create product"}
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin/products" })}
          className="eyebrow border border-border px-6 py-4"
        >
          Cancel
        </button>
      </div>
    </form>
  );
}
