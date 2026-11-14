"use client";
import { LayoutGroup, motion, useReducedMotion } from "motion/react";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { slugify } from "@/lib/catalog";

export function CatalogCategoryTabs({values,value,onChange,label,id,images}: {values: string[];value:string;onChange:(value:string)=>void;label:string;id:string;images?:Record<string,string | undefined>}) {
 const reduce = useReducedMotion();
 return <LayoutGroup id={id}><Tabs value={value} onValueChange={onChange} className="catalog-tabs">
   <TabsList aria-label={label} className="catalog-tabs-list" loop>
    {values.map(name => <TabsTrigger key={name} value={name} id={`${id}-tab-${slugify(name)}`} aria-controls={`${id}-panel`} className="catalog-tab">
      {value === name && <motion.span className="catalog-tab-fill" layoutId="active-tab" transition={reduce ? {duration:0} : {type:"spring",stiffness:420,damping:36}}/>}
      {images?.[name] && <img className="catalog-tab-image" src={images[name]} alt="" aria-hidden="true" onError={event => { event.currentTarget.style.display = "none"; }}/>}<span className="catalog-tab-label">{name}</span>
    </TabsTrigger>)}
   </TabsList>
 </Tabs></LayoutGroup>;
}
